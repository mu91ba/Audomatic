/**
 * Sitemap fetching and parsing utilities
 * Supports both regular sitemaps and sitemap indexes
 */

const https = require('https');
const http = require('http');

// Maximum number of child sitemaps to fetch (prevents infinite loops;
// large Shopify stores split products across many child sitemaps)
const MAX_CHILD_SITEMAPS = 50;
// Optional cap on URLs returned — uncapped by default so template group
// counts reflect the true sitemap totals. The real crawl-volume guard is
// MAX_PAGES in crawler.js; this env override exists for testing.
const MAX_URLS = parseInt(process.env.MAX_SITEMAP_URLS, 10) || Infinity;

/**
 * Fetch sitemap.xml from a website
 * Tries common sitemap locations
 * Now handles sitemap indexes by fetching child sitemaps
 */
async function fetchSitemap(websiteUrl) {
  const baseUrl = new URL(websiteUrl).origin;
  
  // Common sitemap locations to try
  const sitemapPaths = [
    '/sitemap.xml',
    '/sitemap_index.xml',
    '/sitemap1.xml',
    '/robots.txt' // Will parse robots.txt to find sitemap
  ];

  for (const path of sitemapPaths) {
    try {
      const sitemapUrl = baseUrl + path;
      console.log(`   Trying ${sitemapUrl}...`);
      const content = await fetchUrl(sitemapUrl);
      
      if (path === '/robots.txt') {
        // Parse robots.txt to find sitemap URL
        const sitemapMatch = content.match(/Sitemap:\s*(.+)/i);
        if (sitemapMatch) {
          const foundSitemapUrl = sitemapMatch[1].trim();
          console.log(`   Found sitemap in robots.txt: ${foundSitemapUrl}`);
          const sitemapContent = await fetchUrl(foundSitemapUrl);
          // Check if it's a sitemap index and process accordingly
          return await processSitemapContent(sitemapContent);
        }
      } else if (content.includes('<urlset') || content.includes('<sitemapindex')) {
        console.log(`   ✅ Found sitemap at ${sitemapUrl}`);
        // Check if it's a sitemap index and process accordingly
        return await processSitemapContent(content);
      }
    } catch (error) {
      // Continue to next path
      continue;
    }
  }

  throw new Error('Could not find sitemap');
}

/**
 * Priority for child sitemaps: structural pages first, huge template
 * sitemaps (products) last so they can't starve everything else.
 * Lower number = fetched/kept first.
 */
function childSitemapPriority(url) {
  const u = url.toLowerCase();
  if (u.includes('page')) return 0;
  if (u.includes('collection') || u.includes('categor')) return 1;
  if (u.includes('blog') || u.includes('post') || u.includes('article')) return 2;
  if (u.includes('product')) return 4;
  return 3;
}

/**
 * Process sitemap content - handles both regular sitemaps and sitemap indexes
 * @param {string} content - Sitemap XML content
 * @returns {string} - Combined sitemap content with all URLs
 */
async function processSitemapContent(content) {
  // Check if this is a sitemap index (contains references to other sitemaps)
  if (content.includes('<sitemapindex')) {
    console.log(`   📋 Detected sitemap index, fetching child sitemaps...`);

    // Extract child sitemap URLs
    const childSitemapUrls = extractChildSitemapUrls(content);
    console.log(`   Found ${childSitemapUrls.length} child sitemaps`);

    if (childSitemapUrls.length === 0) {
      // No child sitemaps found, return original content
      return content;
    }

    // Fetch ALL child sitemaps (up to the cap), structural sitemaps first.
    // The URL cap is applied AFTER fetching so a huge products sitemap
    // can no longer prevent pages/collections/blogs from being seen.
    const sitemapsToFetch = childSitemapUrls
      .slice()
      .sort((a, b) => childSitemapPriority(a) - childSitemapPriority(b))
      .slice(0, MAX_CHILD_SITEMAPS);

    const urlLists = [];

    for (const childUrl of sitemapsToFetch) {
      try {
        console.log(`   Fetching child sitemap: ${childUrl}`);
        const childContent = await fetchUrl(childUrl);

        // Extract URLs from child sitemap (only regular URLs, not more sitemaps)
        const urls = extractPageUrls(childContent);
        if (urls.length > 0) urlLists.push(urls);
        console.log(`   → ${urls.length} URLs`);
      } catch (error) {
        console.log(`   ⚠️ Could not fetch child sitemap: ${childUrl}`);
        continue;
      }
    }

    // Interleave round-robin across child sitemaps up to MAX_URLS so one
    // giant sitemap (e.g. 1800 Shopify /pages/ URLs) can't starve the
    // others — every section of the site stays represented.
    const combinedUrls = [];
    const seen = new Set();
    const totalAvailable = urlLists.reduce((sum, l) => sum + l.length, 0);
    for (let i = 0; combinedUrls.length < MAX_URLS && combinedUrls.length < totalAvailable; i++) {
      let added = false;
      for (const list of urlLists) {
        if (i < list.length && combinedUrls.length < MAX_URLS) {
          const url = list[i];
          if (!seen.has(url)) {
            seen.add(url);
            combinedUrls.push(url);
          }
          added = true;
        }
      }
      if (!added) break;
    }

    if (combinedUrls.length < totalAvailable) {
      console.log(`   Sampled ${combinedUrls.length} of ${totalAvailable} URLs (round-robin across ${urlLists.length} sitemaps)`);
    } else {
      console.log(`   Collected all ${combinedUrls.length} URLs from ${urlLists.length} child sitemaps`);
    }

    // Create a synthetic urlset with all found URLs
    const syntheticSitemap = createSyntheticSitemap(combinedUrls);
    return syntheticSitemap;
  }

  // Regular sitemap, return as-is
  return content;
}

/**
 * Decode XML entities in <loc> values (&amp; etc.) so query-string
 * sitemap URLs like sitemap_products_1.xml?from=1&amp;to=2 fetch correctly
 */
function decodeXmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Extract child sitemap URLs from a sitemap index.
 * Checks the URL *pathname* for .xml — Shopify child sitemaps carry query
 * strings (sitemap_products_1.xml?from=...&to=...) so a plain endsWith('.xml')
 * misses them entirely.
 */
function extractChildSitemapUrls(xml) {
  const urls = [];
  const locRegex = /<loc>(.*?)<\/loc>/g;
  let match;

  while ((match = locRegex.exec(xml)) !== null) {
    const url = decodeXmlEntities(match[1].trim());
    let pathname = url;
    try {
      pathname = new URL(url).pathname;
    } catch {}
    // Only include XML files (these are child sitemaps)
    if (pathname.toLowerCase().endsWith('.xml')) {
      urls.push(url);
    }
  }

  return urls;
}

// File extensions that are not crawlable HTML pages
const NON_PAGE_EXTENSIONS = /\.(pdf|jpg|jpeg|png|gif|webp|svg|xml|md|txt|json|css|js|zip|mp4|mp3|doc|docx|xls|xlsx|ppt|pptx)$/i;

/**
 * True if the URL looks like a crawlable HTML page (not a file download,
 * image, or plain-text/markdown resource like Shopify's /agents.md)
 */
function isCrawlablePageUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    return !NON_PAGE_EXTENSIONS.test(pathname);
  } catch {
    return !NON_PAGE_EXTENSIONS.test(url);
  }
}

/**
 * Extract page URLs from a regular sitemap (not sitemap index)
 */
function extractPageUrls(xml) {
  const urls = [];
  const locRegex = /<loc>(.*?)<\/loc>/g;
  let match;

  while ((match = locRegex.exec(xml)) !== null) {
    const url = decodeXmlEntities(match[1].trim());
    if (isCrawlablePageUrl(url)) {
      urls.push(url);
    }
  }

  return urls;
}

/**
 * Create a synthetic sitemap XML from a list of URLs
 */
function createSyntheticSitemap(urls) {
  const urlEntries = urls.map(url => `  <url><loc>${url}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;
}

/**
 * Fetch content from URL
 */
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    
    const options = {
      headers: {
        'User-Agent': 'Sightmap-Crawler/1.0'
      }
    };

    client.get(url, options, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

/**
 * Parse URLs from sitemap XML
 * @param {string} xml - Sitemap XML content
 * @returns {string[]} - Array of URLs
 */
function parseSitemapUrls(xml) {
  return extractPageUrls(xml);
}

module.exports = {
  fetchSitemap,
  parseSitemapUrls,
  isCrawlablePageUrl
};







