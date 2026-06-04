/**
 * Render HTML Service
 * A headless browser utility using Playwright.
 * Launches a single headless Chromium instance, navigates to a URL,
 * waits for network idle, injects responsive viewport sizes,
 * and returns the fully executed DOM string.
 */

import { chromium } from 'playwright';

// Singleton browser instance
let browserInstance = null;

/**
 * Initializes and retrieves the singleton Playwright Chromium browser.
 */
async function getBrowser() {
  if (!browserInstance) {
    try {
      browserInstance = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--no-zygote'
        ]
      });
    } catch (error) {
      console.error('[renderHtml] Failed to launch Chromium browser:', error.message);
      throw error;
    }
  }
  return browserInstance;
}

// Pre-defined responsive viewports
const VIEWPORTS = {
  desktop: { width: 1920, height: 1080 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 } // iPhone 12/13/14
};

/**
 * Renders the HTML of a page after JS execution.
 * @param {string} url - The URL to render.
 * @param {Object} options - Configuration options.
 * @param {string} options.viewport - 'desktop', 'tablet', or 'mobile' (default: 'desktop').
 * @param {number} options.timeout - Timeout in milliseconds (default: 30000).
 * @returns {Promise<Object>} An object containing the final URL and DOM string.
 */
export async function renderHtml(url, options = {}) {
  const { viewport = 'desktop', timeout = 30000 } = options;
  const viewportSize = VIEWPORTS[viewport] || VIEWPORTS.desktop;
  
  let context = null;
  let page = null;

  try {
    const browser = await getBrowser();
    
    // Create an isolated browser context for this request
    context = await browser.newContext({
      viewport: viewportSize,
      ignoreHTTPSErrors: true,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 REVREBEL/1.0'
    });

    page = await context.newPage();

    // Navigate to URL and wait for network idle to ensure JS has executed and data is loaded
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout
    });

    const html = await page.content();
    const finalUrl = page.url();

    return {
      success: true,
      url: finalUrl,
      viewport: viewportSize,
      html
    };
  } catch (error) {
    console.error(`[renderHtml] Error rendering ${url}:`, error.message);
    return {
      success: false,
      url,
      error: error.message,
      html: null
    };
  } finally {
    // Ensure context/page are closed to free memory, while keeping browser alive
    if (context) {
      try {
        await context.close();
      } catch (closeError) {
        console.error(`[renderHtml] Error closing context for ${url}:`, closeError.message);
      }
    }
  }
}

/**
 * Closes the global browser instance gracefully.
 * Call this when shutting down the server.
 */
export async function closeBrowser() {
  if (browserInstance) {
    try {
      await browserInstance.close();
    } catch (error) {
      console.error('[renderHtml] Error closing browser instance:', error.message);
    } finally {
      browserInstance = null;
    }
  }
}
