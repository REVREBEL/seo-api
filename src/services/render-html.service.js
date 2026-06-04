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

/**
 * Standard programmatic rendering for simple DOM retrieval requests.
 */
export async function renderHtml(url) {
  return executeBrowserWorkflow(url);
}

/**
 * High-Performance Lifecycle Orchestration Wrapper.
 * Prevents endpoint resource leakage by handling creation, observation, and context disposal in an isolated block.
 * @param {string} url - Destination target.
 * @param {Function} [pageExecutionCallback=null] - Injected step to run tasks against the page before context teardown.
 */
export async function executeBrowserWorkflow(url, pageExecutionCallback = null) {
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 REVREBEL-WebsiteHealthcheck/1.0 (+https://revrebel.io)'
  });
  
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    const html = await page.content();
    const finalUrl = page.url();

    let callbackData = null;
    if (pageExecutionCallback) {
      callbackData = await pageExecutionCallback(page);
    }

    return { html, finalUrl, callbackData };
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