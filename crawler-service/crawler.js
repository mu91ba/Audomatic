/**
 * Main crawler logic - adapted from audit-crawler-enhanced.js
 * Crawls website, takes screenshots, extracts design tokens, and saves to Supabase
 * 
 * Features:
 * - Queue-based crawling with link discovery
 * - Real-time progress tracking
 * - Accurate parent-child hierarchy based on actual links
 * - Depth limiting (max 4 levels)
 */

const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');
const { fetchSitemap, parseSitemapUrls } = require('./sitemap-parser');
const { 
  ensurePageFullyLoaded, 
  handlePopups, 
  extractDesignTokens 
} = require('./page-utils');

// Initialize Supabase client with service role key (has full access)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Configuration
const MAX_DEPTH = 4;        // Maximum depth to crawl (0 = homepage, 4 = deep pages)
const MAX_PAGES = 500;      // Maximum pages to crawl per audit
const DELAY_BETWEEN_PAGES = 2000; // 2 seconds between pages
const MIN_TEMPLATE_GROUP_SIZE = 4; // Min pages sharing a URL pattern to trigger grouping

/**
 * Detect URL pattern for template grouping.
 * /blog/post-title → /blog/*   /services/seo → /services/*
 * Returns null for top-level pages like /about
 */
function detectUrlPattern(url) {
  try {
    const urlObj = new URL(url);
    const segments = urlObj.pathname.split('/').filter(s => s.length > 0);
    if (segments.length < 2) return null;
    return '/' + segments.slice(0, -1).join('/') + '/*';
  } catch {
    return null;
  }
}

/**
 * Group sitemap URLs by URL pattern.
 * For any pattern with >= MIN_TEMPLATE_GROUP_SIZE URLs, keep only the first
 * as a representative and record the total count.
 *
 * Returns:
 *   filteredUrls   – raw URLs to actually crawl (one per template group)
 *   templateCounts – Map<normalizedRepresentativeUrl, totalCount>
 */
function groupSitemapUrls(urls) {
  const patternGroups = new Map(); // pattern → [{raw, normalized}]

  for (const url of urls) {
    const normalized = normalizeUrl(url);
    const pattern = detectUrlPattern(normalized);
    if (pattern) {
      if (!patternGroups.has(pattern)) patternGroups.set(pattern, []);
      patternGroups.get(pattern).push({ raw: url, normalized });
    }
  }

  const skippedRaw = new Set();
  const templateCounts = new Map(); // normalized representative url → total count
  const templateUrls = new Map();   // normalized representative url → all URLs in group

  for (const [, patternEntries] of patternGroups.entries()) {
    if (patternEntries.length >= MIN_TEMPLATE_GROUP_SIZE) {
      const rep = patternEntries[0];
      templateCounts.set(rep.normalized, patternEntries.length);
      templateUrls.set(rep.normalized, patternEntries.map(e => e.normalized));
      patternEntries.slice(1).forEach(e => skippedRaw.add(e.raw));
    }
  }

  const filteredUrls = urls.filter(u => !skippedRaw.has(u));
  return { filteredUrls, templateCounts, templateUrls };
}

/**
 * Main function to crawl a website
 * @param {string} auditId - UUID of the audit in the database
 * @param {string} websiteUrl - URL of the website to crawl
 */
async function crawlWebsite(auditId, websiteUrl) {
  let browser = null;
  
  try {
    console.log(`🚀 Starting crawl for ${websiteUrl}`);
    
    // Normalize base URL (remove trailing slash for consistency)
    const baseUrl = websiteUrl.replace(/\/$/, '');
    const baseOrigin = new URL(baseUrl).origin;
    
    // Update audit status to 'processing'
    await supabase
      .from('audits')
      .update({ 
        status: 'processing',
        processed_pages: 0,
        total_pages: 1  // Start with at least homepage
      })
      .eq('id', auditId);

    // Step 1: Initialize URL queue with sitemap URLs
    console.log('📄 Fetching sitemap...');
    const sitemapUrls = await fetchAndParseSitemap(websiteUrl);
    console.log(`   Found ${sitemapUrls.length} URLs in sitemap`);

    // Group sitemap URLs: collapse template patterns to one representative each
    const { filteredUrls, templateCounts, templateUrls } = groupSitemapUrls(sitemapUrls);
    const skippedCount = sitemapUrls.length - filteredUrls.length;
    if (skippedCount > 0) {
      console.log(`   🗜️  Grouped ${skippedCount} template pages (${templateCounts.size} template type(s) detected)`);
    }

    // Queue structure: { url, depth, discoveredFrom }
    const urlQueue = [];
    const processedUrls = new Set();  // Track URLs we've already processed or queued
    const urlDepths = new Map();      // Track depth for each URL
    const urlDiscoveredFrom = new Map(); // Track which page linked to this URL
    const patternCommitted = new Map(); // Track URL patterns already in queue/processed
    const sitemapSeededUrls = new Set(); // URLs queued only from sitemap (not from link discovery)
    const confirmedLinkedUrls = new Set(); // Sitemap URLs later found via actual link extraction

    // Add homepage first (depth 0)
    const homepageUrl = normalizeUrl(baseUrl);
    urlQueue.push({ url: homepageUrl, depth: 0, discoveredFrom: null });
    processedUrls.add(homepageUrl);
    urlDepths.set(homepageUrl, 0);
    const homepagePattern = detectUrlPattern(homepageUrl);
    if (homepagePattern) patternCommitted.set(homepagePattern, homepageUrl);

    // Add filtered sitemap URLs (one representative per template pattern)
    for (const sitemapUrl of filteredUrls) {
      const normalizedUrl = normalizeUrl(sitemapUrl);
      if (!processedUrls.has(normalizedUrl)) {
        const depth = normalizedUrl === homepageUrl ? 0 : 1;
        urlQueue.push({ url: normalizedUrl, depth, discoveredFrom: homepageUrl });
        processedUrls.add(normalizedUrl);
        urlDepths.set(normalizedUrl, depth);
        urlDiscoveredFrom.set(normalizedUrl, homepageUrl);
        // Mark as sitemap-seeded (may be upgraded to 'linked' if discovered via actual links)
        if (normalizedUrl !== homepageUrl) {
          sitemapSeededUrls.add(normalizedUrl);
        }
        const pattern = detectUrlPattern(normalizedUrl);
        if (pattern && !patternCommitted.has(pattern)) {
          patternCommitted.set(pattern, normalizedUrl);
        }
      }
    }

    // Update total pages count
    await updateProgress(auditId, 0, urlQueue.length);

    // Step 2: Launch browser
    console.log('🌐 Launching browser...');
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=LazyFrameLoading'
      ]
    });

    // Step 3: Process URLs from queue
    const designTokensData = {
      colors: new Map(),
      typography: new Map()
    };

    let processedCount = 0;

    while (urlQueue.length > 0 && processedCount < MAX_PAGES) {
      const { url, depth, discoveredFrom } = urlQueue.shift();
      processedCount++;
      
      console.log(`\n📄 [${processedCount}/${urlQueue.length + processedCount}] Processing (depth ${depth}): ${url}`);
      
      try {
        // A page is standalone if it was only seeded from the sitemap and never discovered via an actual link
        const isStandalone = sitemapSeededUrls.has(url) && !confirmedLinkedUrls.has(url);

        // Process page and get discovered links
        const discoveredLinks = await processPage(
          browser,
          auditId,
          url,
          baseUrl,
          baseOrigin,
          designTokensData,
          depth,
          discoveredFrom,
          templateCounts,
          templateUrls,
          isStandalone
        );

        // Add newly discovered links to queue (if not at max depth)
        if (depth < MAX_DEPTH) {
          for (const link of discoveredLinks) {
            const normalizedLink = normalizeUrl(link);
            // If this link was previously sitemap-seeded, it's now confirmed linked
            if (sitemapSeededUrls.has(normalizedLink)) {
              confirmedLinkedUrls.add(normalizedLink);
            }
            if (!processedUrls.has(normalizedLink) && urlQueue.length + processedCount < MAX_PAGES) {
              // Skip if this URL's pattern already has a representative in the queue
              const linkPattern = detectUrlPattern(normalizedLink);
              if (linkPattern && patternCommitted.has(linkPattern)) {
                continue;
              }
              urlQueue.push({
                url: normalizedLink,
                depth: depth + 1,
                discoveredFrom: url
              });
              processedUrls.add(normalizedLink);
              urlDepths.set(normalizedLink, depth + 1);
              urlDiscoveredFrom.set(normalizedLink, url);
              if (linkPattern) patternCommitted.set(linkPattern, normalizedLink);
            }
          }
        }

        // Update progress
        await updateProgress(auditId, processedCount, urlQueue.length + processedCount);

      } catch (error) {
        console.error(`   ❌ Error processing ${url}:`, error.message);
        // Continue with next page even if one fails
      }

      // Small delay between pages to avoid overwhelming the server
      if (urlQueue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_PAGES));
      }
    }

    // Step 4: Save aggregated design tokens
    console.log('\n🎨 Saving design tokens...');
    try {
      await saveDesignTokens(auditId, designTokensData);
      console.log('   ✅ Design tokens saved');
    } catch (tokenError) {
      console.error('   ⚠️ Error saving design tokens (continuing):', tokenError.message);
      // Don't fail the entire crawl if design tokens fail to save
    }

    // Step 5: Mark audit as completed
    console.log('\n📝 Updating audit status to completed...');
    try {
      const { data, error: updateError } = await supabase
        .from('audits')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString(),
          processed_pages: processedCount,
          total_pages: processedCount
        })
        .eq('id', auditId)
        .select();

      if (updateError) {
        console.error('   ❌ Supabase update error:', updateError);
        throw new Error(`Failed to update audit status: ${updateError.message}`);
      }

      if (!data || data.length === 0) {
        console.error('   ⚠️ Warning: Update returned no data - audit may not exist');
      } else {
        console.log('   ✅ Audit status updated to completed');
      }
    } catch (statusError) {
      console.error('   ❌ Failed to update status to completed:', statusError.message);
      // Try one more time with a delay
      console.log('   🔄 Retrying status update...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const { error: retryError } = await supabase
        .from('audits')
        .update({ 
          status: 'completed',
          completed_at: new Date().toISOString(),
          processed_pages: processedCount,
          total_pages: processedCount
        })
        .eq('id', auditId);
      
      if (retryError) {
        console.error('   ❌ Retry also failed:', retryError.message);
      } else {
        console.log('   ✅ Retry successful - status updated');
      }
    }

    console.log(`\n✅ Crawl completed successfully! Processed ${processedCount} pages.`);

  } catch (error) {
    console.error(`\n❌ Fatal error during crawl:`, error);
    
    // Mark audit as failed
    try {
      const { error: updateError } = await supabase
        .from('audits')
        .update({ 
          status: 'failed',
          error_message: error.message || 'Unknown error'
        })
        .eq('id', auditId);
      
      if (updateError) {
        console.error('   ❌ Also failed to update status to failed:', updateError.message);
      } else {
        console.log('   📝 Audit marked as failed in database');
      }
    } catch (statusError) {
      console.error('   ❌ Could not update audit status:', statusError.message);
    }

    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Update progress in database (for real-time progress bar)
 */
async function updateProgress(auditId, processed, total) {
  await supabase
    .from('audits')
    .update({ 
      processed_pages: processed,
      total_pages: total
    })
    .eq('id', auditId);
}

/**
 * Normalize URL for consistent comparison
 * - Removes trailing slashes
 * - Removes hash fragments
 * - Removes common tracking params
 */
function normalizeUrl(url) {
  try {
    const urlObj = new URL(url);
    // Remove hash
    urlObj.hash = '';
    // Remove common tracking params
    urlObj.searchParams.delete('utm_source');
    urlObj.searchParams.delete('utm_medium');
    urlObj.searchParams.delete('utm_campaign');
    urlObj.searchParams.delete('ref');
    // Get clean URL and remove trailing slash
    let clean = urlObj.href;
    if (clean.endsWith('/') && urlObj.pathname !== '/') {
      clean = clean.slice(0, -1);
    }
    return clean;
  } catch {
    return url;
  }
}

/**
 * Fetch and parse sitemap from website
 */
async function fetchAndParseSitemap(websiteUrl) {
  try {
    const sitemapXml = await fetchSitemap(websiteUrl);
    const urls = parseSitemapUrls(sitemapXml);
    return urls;
  } catch (error) {
    console.log('   ⚠️  Could not fetch sitemap, will discover pages via links');
    return [];
  }
}

/**
 * Extract internal links from a page
 */
async function extractInternalLinks(page, baseOrigin) {
  try {
    const links = await page.evaluate((origin) => {
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      return anchors
        .map(a => {
          try {
            // Resolve relative URLs
            const href = a.href;
            return href;
          } catch {
            return null;
          }
        })
        .filter(href => href !== null);
    }, baseOrigin);

    // Filter to only internal links
    const internalLinks = links.filter(link => {
      try {
        const url = new URL(link);
        // Must be same origin
        if (url.origin !== baseOrigin) return false;
        // Skip file downloads
        if (/\.(pdf|zip|doc|docx|xls|xlsx|ppt|pptx|jpg|jpeg|png|gif|svg|mp4|mp3)$/i.test(url.pathname)) return false;
        // Skip mailto: and tel: links
        if (link.startsWith('mailto:') || link.startsWith('tel:')) return false;
        return true;
      } catch {
        return false;
      }
    });

    // Remove duplicates
    return [...new Set(internalLinks)];
  } catch (error) {
    console.error('   ⚠️  Error extracting links:', error.message);
    return [];
  }
}

/**
 * Process a single page: screenshot + design token extraction + link discovery
 * Returns array of discovered internal links
 */
async function processPage(browser, auditId, url, baseUrl, baseOrigin, designTokensData, depth, discoveredFrom, templateCounts = new Map(), templateUrls = new Map(), isStandalone = false) {
  let page = null;
  let discoveredLinks = [];
  
  try {
    page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    
    // Block unnecessary resources for faster loading (allow fonts so text renders correctly)
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if(['media'].includes(req.resourceType())){
        req.abort();
      } else {
        req.continue();
      }
    });

    // Navigate to page
    await page.goto(url, { 
      waitUntil: 'networkidle2',
      timeout: 60000 
    });

    // Prevent popups and modals
    await page.evaluate(() => {
      window.alert = () => {};
      window.confirm = () => true;
      window.prompt = () => null;
    });

    // Handle popups
    await handlePopups(page);
    
    // Ensure page fully loaded
    await ensurePageFullyLoaded(page);
    
    // Get page title
    const title = await page.title();

    // Extract internal links for further crawling
    console.log('   🔗 Extracting links...');
    discoveredLinks = await extractInternalLinks(page, baseOrigin);
    console.log(`   Found ${discoveredLinks.length} internal links`);

    // Prepare page for full-page screenshot
    console.log('   📸 Taking screenshot...');
    await page.evaluate(() => {
      // Only fix things that break fullPage screenshots — nothing else
      // 1. Convert fixed-position elements so they don't repeat at every viewport
      document.querySelectorAll('*').forEach(el => {
        if (window.getComputedStyle(el).position === 'fixed') {
          el.style.position = 'absolute';
        }
      });
      // 2. Ensure body/html don't clip content
      document.documentElement.style.overflow = 'visible';
      document.body.style.overflow = 'visible';
    });

    await page.waitForTimeout(500);

    const screenshot = await page.screenshot({
      fullPage: true,
      type: 'png'
    });

    // Upload screenshot to Supabase Storage
    const screenshotFileName = `${auditId}/${generateFilename(url)}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('screenshots')
      .upload(screenshotFileName, screenshot, {
        contentType: 'image/png',
        upsert: true
      });

    if (uploadError) {
      throw new Error(`Screenshot upload failed: ${uploadError.message}`);
    }

    // Get public URL for screenshot
    const { data: { publicUrl } } = supabase.storage
      .from('screenshots')
      .getPublicUrl(screenshotFileName);

    console.log('   ✅ Screenshot uploaded');

    // Extract design tokens
    const tokens = await extractDesignTokens(page, url);

    // Merge tokens into global collection
    mergeDesignTokens(designTokensData, tokens, url);

    // Save page to database with hierarchy info
    await supabase.from('pages').insert({
      audit_id: auditId,
      url: url,
      title: title,
      screenshot_url: publicUrl,
      level: depth,
      parent_url: discoveredFrom,
      discovered_from: discoveredFrom,
      depth: depth,
      is_template: templateCounts.has(url),
      template_count: templateCounts.get(url) || null,
      template_urls: templateUrls.get(url) || null,
      source: isStandalone ? 'sitemap_only' : 'linked',
    });

    console.log('   ✅ Page data saved');

    return discoveredLinks;

  } finally {
    if (page) {
      await page.close();
    }
  }
}

/**
 * Generate safe filename from URL
 */
function generateFilename(url) {
  return url
    .replace('https://', '')
    .replace('http://', '')
    .replace(/\//g, '_')
    .replace(/[?:=&]/g, '_')
    .replace(/_{2,}/g, '_')
    + '.png';
}

/**
 * Merge extracted design tokens into global collection
 */
function mergeDesignTokens(designTokensData, tokens, url) {
  // Merge colors
  tokens.colors.forEach(color => {
    const key = color.hex;
    if (!designTokensData.colors.has(key)) {
      designTokensData.colors.set(key, {
        hex: color.hex,
        usage: new Set(color.usage),
        count: color.count,
        pages: []
      });
    } else {
      const existing = designTokensData.colors.get(key);
      color.usage.forEach(u => existing.usage.add(u));
      existing.count += color.count;
    }
    designTokensData.colors.get(key).pages.push(url);
  });

  // Merge typography
  tokens.fonts.forEach(font => {
    const key = font.family;
    if (!designTokensData.typography.has(key)) {
      designTokensData.typography.set(key, {
        family: font.family,
        weights: new Set(font.weights),
        sizes: new Map()
      });
    } else {
      const existing = designTokensData.typography.get(key);
      font.weights.forEach(w => existing.weights.add(w));
    }
    
    const existing = designTokensData.typography.get(key);
    font.sizes.forEach(sizeData => {
      const sizeKey = sizeData.size;
      if (!existing.sizes.has(sizeKey)) {
        existing.sizes.set(sizeKey, 0);
      }
      existing.sizes.set(sizeKey, existing.sizes.get(sizeKey) + sizeData.occurrences);
    });
  });
}

/**
 * Save aggregated design tokens to database
 */
async function saveDesignTokens(auditId, designTokensData) {
  // Calculate color frequency
  const totalColorCount = Array.from(designTokensData.colors.values())
    .reduce((sum, color) => sum + color.count, 0);

  const processedColors = Array.from(designTokensData.colors.values())
    .map(color => {
      const percentage = totalColorCount > 0 ? (color.count / totalColorCount) * 100 : 0;
      let frequency;
      if (percentage > 30) frequency = 'high';
      else if (percentage > 10) frequency = 'medium';
      else frequency = 'low';

      return {
        hex: color.hex,
        usage: Array.from(color.usage),
        frequency: frequency,
        count: color.count,
        examplePages: color.pages.slice(0, 3)
      };
    })
    .sort((a, b) => b.count - a.count);

  // Process typography
  const processedFonts = Array.from(designTokensData.typography.values())
    .map(font => {
      const sizes = Array.from(font.sizes.entries())
        .map(([size, count]) => ({
          size: size,
          occurrences: count,
          flag: count <= 3 // Flag if used 3 or fewer times
        }))
        .sort((a, b) => b.occurrences - a.occurrences);

      return {
        fontFamily: font.family,
        weights: Array.from(font.weights).sort((a, b) => a - b),
        sizes: sizes
      };
    });

  // Save to database
  await supabase.from('design_tokens').insert({
    audit_id: auditId,
    colors: processedColors,
    typography: processedFonts
  });
}

module.exports = { crawlWebsite };
