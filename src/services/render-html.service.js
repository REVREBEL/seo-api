/**
 * Render HTML Service
 * Centralized, singleton browser orchestration engine using Playwright.
 */

import { chromium } from 'playwright';

let browserInstance = null;

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
      console.error('[renderHtml] Failed to spawn internal browser instance:', error.message);
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
 * Standard programmatic rendering for simple DOM retrieval requests.
 * Legacy wrapper: maps the workflow output to the original rich object contract and propagates errors.
 */
export async function renderHtml(url, options = {}) {
  const { html, finalUrl, viewportSize, status } = await executeBrowserWorkflow(url, options);
  return {
    success: true,
    url: finalUrl,
    viewport: viewportSize,
    status,
    html
  };
}

/**
 * High-Performance Lifecycle Orchestration Wrapper.
 * Prevents endpoint resource leakage by handling creation, observation, and context disposal in an isolated block.
 * @param {string} url - Destination target.
 * @param {Object|Function} [options={}] - Configuration options for viewport/user-agent, or the callback if options omitted.
 * @param {Function} [pageExecutionCallback=null] - Injected step to run tasks against the page before context teardown.
 */
export async function executeBrowserWorkflow(url, options = {}, pageExecutionCallback = null) {
  // Support legacy calling pattern where options is omitted and callback is passed as second argument
  if (typeof options === 'function') {
    pageExecutionCallback = options;
    options = {};
  } else if (!options || typeof options !== 'object') {
    options = {};
  }
  
  const { 
    viewport = 'desktop', 
    userAgent = 'Mozilla/5.0 REVREBEL-WebsiteHealthcheck/1.0 (+https://revrebel.io)' 
  } = options;
  
  const viewportSize = (typeof viewport === 'object' && viewport.width && viewport.height)
    ? viewport
    : VIEWPORTS[viewport] || VIEWPORTS.desktop;

  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: viewportSize,
    ignoreHTTPSErrors: true,
    userAgent
  });
  
  try {
    const page = await context.newPage();
    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    const status = response?.status();
    const html = await page.content();
    const finalUrl = page.url();

    let callbackData = null;
    if (pageExecutionCallback) {
      callbackData = await pageExecutionCallback(page);
    }

    return { html, finalUrl, status, callbackData, viewportSize };
  } catch (error) {
    console.error(`[executeBrowserWorkflow] Navigation run error for ${url}:`, error.message);
    throw error;
  } finally {
    // Structural isolation protection: context drops away, singleton browser process persists
    await context.close();
  }
}

export async function closeBrowser() {
  if (browserInstance) {
    try {
      await browserInstance.close();
    } catch (error) {
      console.error('[renderHtml] Teardown exception tracker:', error.message);
    } finally {
      browserInstance = null;
    }
  }
}