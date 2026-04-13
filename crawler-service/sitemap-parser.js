/**
 * Sitemap fetching and parsing utilities
 * Supports both regular sitemaps and sitemap indexes
 */

const https = require('https');
const http = require('http');

// Maximum number of child sitemaps to fetch (prevents infinite loops)
const MAX_CHILD_SITEMAPS = 10;
// Maximum URLs to return (prevents memory issues)
const MAX_URLS = 500;

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
    
    // Fetch child sitemaps (limited to prevent infinite loops)
    const sitemapsToFetch = childSitemapUrls.slice(0, MAX_CHILD_SITEMAPS);
    let combinedUrls = [];
    
    for (const childUrl of sitemapsToFetch) {
      try {
        console.log(`   Fetching child sitemap: ${childUrl}`);
        const childContent = await fetchUrl(childUrl);
        
        // Extract URLs from child sitemap (only regular URLs, not more sitemaps)
        const urls = extractPageUrls(childContent);
        combinedUrls = combinedUrls.concat(urls);
        
        // Stop if we have enough URLs
        if (combinedUrls.length >= MAX_URLS) {
          console.log(`   Reached URL limit (${MAX_URLS}), stopping`);
          break;
        }
      } catch (error) {
        console.log(`   ⚠️ Could not fetch child sitemap: ${childUrl}`);
        continue;
      }
    }
    
    // Create a synthetic urlset with all found URLs
    const syntheticSitemap = createSyntheticSitemap(combinedUrls.slice(0, MAX_URLS));
    return syntheticSitemap;
  }
  
  // Regular sitemap, return as-is
  return content;
}

/**
 * Extract child sitemap URLs from a sitemap index
 */
function extractChildSitemapUrls(xml) {
  const urls = [];
  const locRegex = /<loc>(.*?)<\/loc>/g;
  let match;
  
  while ((match = locRegex.exec(xml)) !== null) {
    const url = match[1].trim();
    // Only include XML files (these are child sitemaps)
    if (url.toLowerCase().endsWith('.xml')) {
      urls.push(url);
    }
  }
  
  return urls;
}

/**
 * Extract page URLs from a regular sitemap (not sitemap index)
 */
function extractPageUrls(xml) {
  const urls = [];
  const locRegex = /<loc>(.*?)<\/loc>/g;
  let match;
  
  while ((match = locRegex.exec(xml)) !== null) {
    const url = match[1].trim();
    // Skip non-page files
    if (!url.toLowerCase().endsWith('.pdf') && 
        !url.toLowerCase().endsWith('.jpg') &&
        !url.toLowerCase().endsWith('.png') &&
        !url.toLowerCase().endsWith('.xml')) {
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
  const urls = [];
  
  // Match <loc>URL</loc> tags
  const locRegex = /<loc>(.*?)<\/loc>/g;
  let match;
  
  while ((match = locRegex.exec(xml)) !== null) {
    const url = match[1].trim();
    
    // Skip PDF files and other non-HTML content
    if (!url.toLowerCase().endsWith('.pdf') && 
        !url.toLowerCase().endsWith('.jpg') &&
        !url.toLowerCase().endsWith('.png') &&
        !url.toLowerCase().endsWith('.xml')) {
      urls.push(url);
    }
  }

  return urls;
}

module.exports = {
  fetchSitemap,
  parseSitemapUrls
};







