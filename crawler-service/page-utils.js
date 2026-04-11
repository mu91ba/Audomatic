/**
 * Page utilities - handling page loading, popups, and design token extraction
 * Adapted from audit-crawler-enhanced.js
 */

/**
 * Ensure page is fully loaded before taking screenshot
 */
async function ensurePageFullyLoaded(page) {
  console.log('   ⏳ Ensuring page is fully loaded...');

  // Wait for document ready state
  try {
    await page.waitForFunction(() => document.readyState === 'complete', { timeout: 15000 });
  } catch (error) {
    console.log('   ⚠️  Page ready state timeout, continuing...');
  }

  // Wait for web fonts
  try {
    await page.evaluate(() => document.fonts.ready);
  } catch (error) {}

  // Scroll through entire page like a real user — triggers lazy loading & scroll animations
  // Re-checks page height each step since lazy content can make the page grow
  await page.evaluate(async () => {
    await new Promise(resolve => {
      let currentPosition = 0;
      const viewportHeight = window.innerHeight;
      const distance = Math.floor(viewportHeight / 2); // scroll half a viewport at a time
      const timer = setInterval(() => {
        window.scrollTo(0, currentPosition);
        currentPosition += distance;
        const scrollHeight = Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight
        );
        if (currentPosition >= scrollHeight) {
          clearInterval(timer);
          // Wait at bottom for lazy content to finish loading
          setTimeout(resolve, 3000);
        }
      }, 200); // 200ms between scrolls — fast enough but gives content time to trigger
    });
  });

  // Force-load any remaining lazy images
  await page.evaluate(() => {
    document.querySelectorAll('img[loading="lazy"], img[data-src], img[data-lazy], img[data-original]').forEach(img => {
      if (img.dataset.src) img.src = img.dataset.src;
      if (img.dataset.lazy) img.src = img.dataset.lazy;
      if (img.dataset.original) img.src = img.dataset.original;
      img.loading = 'eager';
    });
  });

  // Wait for all images (including background images) to load
  await page.evaluate(async () => {
    // Wait for <img> elements
    const imgPromises = Array.from(document.querySelectorAll('img')).map(img => new Promise(resolve => {
      if (img.complete && img.naturalHeight !== 0) return resolve();
      img.onload = resolve;
      img.onerror = resolve;
      setTimeout(resolve, 8000);
    }));

    // Wait for CSS background images
    const bgPromises = [];
    document.querySelectorAll('*').forEach(el => {
      const bg = window.getComputedStyle(el).backgroundImage;
      if (bg && bg !== 'none') {
        const matches = bg.match(/url\(["']?(.*?)["']?\)/g);
        if (matches) {
          matches.forEach(m => {
            const url = m.replace(/url\(["']?/, '').replace(/["']?\)/, '');
            if (url && !url.startsWith('data:')) {
              bgPromises.push(new Promise(resolve => {
                const img = new Image();
                img.onload = resolve;
                img.onerror = resolve;
                img.src = url;
                setTimeout(resolve, 8000);
              }));
            }
          });
        }
      }
    });

    await Promise.all([...imgPromises, ...bgPromises]);
  });

  // Scroll back to top and let page settle
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1000);
}

/**
 * Handle and remove popups/modals
 */
async function handlePopups(page) {
  try {
    await page.waitForTimeout(2000);
    
    // Try to close common popup types
    await page.evaluate(() => {
      // Close buttons
      const closeSelectors = [
        '.close',
        '.modal-close',
        '[aria-label="Close"]',
        '[aria-label="close"]',
        'button.close'
      ];
      
      closeSelectors.forEach(selector => {
        const closeBtn = document.querySelector(selector);
        if (closeBtn) closeBtn.click();
      });
    });

    await page.waitForTimeout(1000);

    // Remove popup elements from DOM
    const popupSelectors = [
      '.modal', 
      '.popup', 
      '.cookie-banner', 
      '.cookie-consent',
      '.newsletter-popup',
      '[role="dialog"]',
      '[aria-modal="true"]',
      '.modal-backdrop'
    ];

    for (const selector of popupSelectors) {
      try {
        await page.evaluate((sel) => {
          const elements = document.querySelectorAll(sel);
          elements.forEach(el => el.remove());
        }, selector);
      } catch (error) {
        // Continue if selector doesn't exist
      }
    }

    // Reset body styles that popups might have changed
    await page.evaluate(() => {
      document.body.classList.remove('modal-open');
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    });

  } catch (error) {
    console.log('   ⚠️  Error handling popups:', error.message);
  }
}

/**
 * Extract design tokens (colors and typography) from page
 */
async function extractDesignTokens(page, url) {
  console.log('   🎨 Extracting design tokens...');
  
  const tokens = await page.evaluate(() => {
    // Helper to convert colors to hex
    const rgbToHex = (r, g, b) => {
      return '#' + [r, g, b].map(x => {
        const hex = Math.round(x).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      }).join('');
    };

    const colorToHex = (color) => {
      if (!color || color === 'transparent') return null;
      
      if (color.startsWith('#')) {
        return color.toLowerCase();
      }
      
      const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (match) {
        return rgbToHex(parseInt(match[1]), parseInt(match[2]), parseInt(match[3]));
      }
      
      return null;
    };

    // Extract colors
    const colorMap = new Map();
    const elements = document.querySelectorAll('*');
    
    elements.forEach(el => {
      const style = window.getComputedStyle(el);
      
      // Text color
      const textColor = colorToHex(style.color);
      if (textColor) {
        if (!colorMap.has(textColor)) {
          colorMap.set(textColor, { hex: textColor, usage: new Set(), count: 0 });
        }
        colorMap.get(textColor).usage.add('text');
        colorMap.get(textColor).count++;
      }
      
      // Background color
      const bgColor = colorToHex(style.backgroundColor);
      if (bgColor && bgColor !== '#ffffff' && bgColor !== '#000000') {
        if (!colorMap.has(bgColor)) {
          colorMap.set(bgColor, { hex: bgColor, usage: new Set(), count: 0 });
        }
        colorMap.get(bgColor).usage.add('background');
        colorMap.get(bgColor).count++;
      }
      
      // Border color
      const borderColor = colorToHex(style.borderColor);
      if (borderColor && borderColor !== textColor && borderColor !== bgColor) {
        if (!colorMap.has(borderColor)) {
          colorMap.set(borderColor, { hex: borderColor, usage: new Set(), count: 0 });
        }
        colorMap.get(borderColor).usage.add('border');
        colorMap.get(borderColor).count++;
      }
    });

    // Extract typography
    const fontMap = new Map();
    
    elements.forEach(el => {
      const style = window.getComputedStyle(el);
      const fontFamily = style.fontFamily.split(',')[0].replace(/['"]/g, '').trim();
      const fontSize = parseFloat(style.fontSize);
      const fontWeight = style.fontWeight;
      
      if (!fontMap.has(fontFamily)) {
        fontMap.set(fontFamily, { 
          family: fontFamily, 
          weights: new Set(), 
          sizes: new Map() 
        });
      }
      
      const font = fontMap.get(fontFamily);
      font.weights.add(parseInt(fontWeight));
      
      const sizeKey = Math.round(fontSize) + 'px';
      if (!font.sizes.has(sizeKey)) {
        font.sizes.set(sizeKey, 0);
      }
      font.sizes.set(sizeKey, font.sizes.get(sizeKey) + 1);
    });

    // Convert Maps to arrays for JSON serialization
    const colors = Array.from(colorMap.values()).map(color => ({
      hex: color.hex,
      usage: Array.from(color.usage),
      count: color.count
    }));

    const fonts = Array.from(fontMap.values()).map(font => ({
      family: font.family,
      weights: Array.from(font.weights).sort((a, b) => a - b),
      sizes: Array.from(font.sizes.entries()).map(([size, count]) => ({
        size,
        occurrences: count
      }))
    }));

    return { colors, fonts };
  });

  console.log(`   Found ${tokens.colors.length} colors, ${tokens.fonts.length} fonts`);
  
  return tokens;
}

module.exports = {
  ensurePageFullyLoaded,
  handlePopups,
  extractDesignTokens
};








