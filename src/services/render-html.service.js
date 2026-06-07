/**
 * Render HTML Service
 * Centralized, singleton browser orchestration engine using Playwright.
 */

import { chromium } from 'playwright';

let browserInstance = null;

const VIEWPORTS = {
  desktop: { width: 1920, height: 1080 },
  laptop: { width: 1366, height: 768 },
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

export async function renderHtml(url, options = {}) {
  try {
    const result = await executeBrowserWorkflow(url, options);

    return {
      success: true,
      url: result.finalUrl,
      viewport: result.viewportSize,
      status: result.status,
      html: result.html,
      browserEvidence: result.browserEvidence
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      html: null
    };
  }
}

export async function executeBrowserWorkflow(
  url,
  options = {},
  pageExecutionCallback = null
) {
  if (typeof options === 'function') {
    pageExecutionCallback = options;
    options = {};
  } else if (!options || typeof options !== 'object') {
    options = {};
  }

  const viewportSize = resolveViewport(options.viewport || 'desktop');
  const userAgent = options.userAgent || DEFAULT_USER_AGENT;

  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: viewportSize,
    ignoreHTTPSErrors: true,
    userAgent,
    deviceScaleFactor: options.viewport === 'mobile' ? 2 : 1
  });

  try {
    const page = await context.newPage();
    const consoleErrors = [];
    const failedRequests = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    page.on('requestfailed', (request) => {
      failedRequests.push({
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
        failure: request.failure()?.errorText || null
      });
    });

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
    const visualEvidence = await collectVisualEvidence(page, viewportSize);

    let callbackData = null;

    if (pageExecutionCallback) {
      callbackData = await pageExecutionCallback(page);
    }

    return {
      html,
      finalUrl,
      status,
      callbackData,
      viewportSize,
      browserEvidence: {
        consoleErrors,
        failedRequests,
        visual: visualEvidence
      }
    };
  } catch (error) {
    console.error(`[executeBrowserWorkflow] Navigation error for ${url}:`, error.message);
    throw error;
  } finally {
    await context.close();
  }
}

async function collectVisualEvidence(page, viewportSize) {
  return await page.evaluate(({ width, height }) => {
    const h1 = document.querySelector('h1');
    const h1Box = h1 ? h1.getBoundingClientRect() : null;
    const ctaSelectors = [
      "a[href*='book']",
      "a[href*='reserve']",
      "a[href*='reservation']",
      "a[href*='contact']",
      "button",
      '.cta',
      "[class*='cta']"
    ];
    const ctaVisible = ctaSelectors.some((selector) => {
      try {
        const el = document.querySelector(selector);
        if (!el) return false;
        const box = el.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && box.top < height;
      } catch {
        return false;
      }
    });

    const hero = document.querySelector('.hero img, [class*="hero"] img, header img, main img');
    const bodyFontSize = Number.parseFloat(window.getComputedStyle(document.body).fontSize || '0');
    const viewportMeta = Boolean(document.querySelector('meta[name="viewport"]'));

    return {
      aboveFold: {
        h1Visible: Boolean(h1Box && h1Box.width > 0 && h1Box.height > 0 && h1Box.top < height),
        ctaVisible,
        heroImage: hero ? hero.getAttribute('src') : null
      },
      mobile: {
        viewportMeta,
        horizontalScroll: document.documentElement.scrollWidth > window.innerWidth
      },
      fonts: {
        baseSize: bodyFontSize || null,
        readable: bodyFontSize >= 16
      },
      viewport: { width, height }
    };
  }, viewportSize);
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
