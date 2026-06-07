/**
 * Render HTML Service
 * Centralized, singleton browser orchestration engine using Playwright.
 */

import { chromium } from 'playwright';

let browserInstance = null;

const VIEWPORTS = {
  desktop: { width: 1920, height: 1080 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 }
};

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 REVREBEL-WebsiteHealthcheck/1.0 (+https://revrebel.io)';

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
      console.error('[getBrowser] Failed to launch Chromium:', error.stack ?? error);
      throw error;
    }
  }

  return browserInstance;
}

function resolveViewport(viewport = 'desktop') {
  if (
    viewport &&
    typeof viewport === 'object' &&
    Number.isFinite(viewport.width) &&
    Number.isFinite(viewport.height) &&
    viewport.width > 0 &&
    viewport.height > 0
  ) {
    return viewport;
  }

  return VIEWPORTS[viewport] || VIEWPORTS.desktop;
}

/**
 * Standard programmatic rendering for simple DOM retrieval requests.
 * @param {string} url - Target URL.
 * @param {Object} [options={}] - Viewport and user-agent options.
 */
export async function renderHtml(url, options = {}) {
  try {
    const result = await executeBrowserWorkflow(url, options);

    return {
      success: true,
      url: result.finalUrl,
      viewport: result.viewportSize,
      status: result.status,
      html: result.html
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      html: null
    };
  }
}

/**
 * High-performance lifecycle orchestration wrapper.
 * Supports two call signatures:
 *   executeBrowserWorkflow(url, callback)
 *   executeBrowserWorkflow(url, options, callback)
 *
 * @param {string} url - Destination target.
 * @param {Object|Function} [options={}] - Config options or callback if options omitted.
 * @param {Function} [pageExecutionCallback=null] - Optional page-level task to run before teardown.
 */
export async function executeBrowserWorkflow(
  url,
  options = {},
  pageExecutionCallback = null
) {
  // Support legacy calling pattern: options omitted, callback passed as second argument
  if (typeof options === 'function') {
    pageExecutionCallback = options;
    options = {};
  } else if (!options || typeof options !== 'object') {
    // Defensive guard: normalise null, strings, or other primitives to a safe empty object
    options = {};
  }

  const viewportSize = resolveViewport(options.viewport || 'desktop');
  const userAgent = options.userAgent || DEFAULT_USER_AGENT;

  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: viewportSize,
    ignoreHTTPSErrors: true,
    userAgent
  });

  try {
    const page = await context.newPage();

    const response = await page.goto(url, {
      waitUntil: options.waitUntil || 'networkidle',
      timeout: options.timeout || 30000
    });

    if (options.settleTimeMs) {
      await page.waitForTimeout(options.settleTimeMs);
    }

    const html = await page.content();
    const finalUrl = page.url();
    const status = response?.status() || null;

    let callbackData = null;

    if (pageExecutionCallback) {
      callbackData = await pageExecutionCallback(page);
    }

    return {
      html,
      finalUrl,
      status,
      callbackData,
      viewportSize
    };
  } catch (error) {
    console.error(`[executeBrowserWorkflow] Navigation error for ${url}:`, error.message);
    throw error;
  } finally {
    // Context dropped per request; singleton browser process persists
    await context.close();
  }
}

export async function closeBrowser() {
  if (browserInstance) {
    try {
      await browserInstance.close();
    } catch (error) {
      console.error('[closeBrowser] Teardown error:', error.message);
    } finally {
      browserInstance = null;
    }
  }
}
