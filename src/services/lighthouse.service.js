/**
 * Lighthouse Service
 * Runs a programmatic Lighthouse audit optimized for an Ubuntu server context.
 * Relies exclusively on Playwright to spawn the Chromium runtime, eliminating chrome-launcher conflicts.
 * Extracts raw Performance, SEO, and Best Practices metric arrays.
 */

import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';
import { chromium } from 'playwright';

/**
 * Executes a headless Lighthouse audit using Playwright's Chromium engine.
 * @param {string} url - The URL to audit.
 * @param {Object} options - Additional Lighthouse configuration options.
 * @returns {Promise<Object>} Normalized Performance, SEO, and Best Practices metrics.
 */
export async function runLighthouseAudit(url, options = {}) {
  const chrome = await launch({
    chromePath: chromium.executablePath(),
    chromeFlags: [
      '--headless=new',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  });

  try {
    const lhOptions = {
      logLevel: 'error',
      output: 'json',
      onlyCategories: ['performance', 'seo', 'best-practices'],
      port: chrome.port,
      ...options
    };

    // Run the programmatic Lighthouse audit
    const runnerResult = await lighthouse(url, lhOptions);
    const report = runnerResult.lhr;

    // Extract cleanly formatted metric arrays
    return {
      performance: {
        score: report.categories.performance?.score || 0,
        metrics: _extractMetrics(report, 'performance')
      },
      seo: {
        score: report.categories.seo?.score || 0,
        metrics: _extractMetrics(report, 'seo')
      },
      bestPractices: {
        score: report.categories['best-practices']?.score || 0,
        metrics: _extractMetrics(report, 'best-practices')
      }
    };
  } catch (error) {
    console.error(`[Lighthouse] Audit failed for ${url}:`, error.message);
    throw error;
  } finally {
    await chrome.kill();
  }
}

/**
 * Normalizes Lighthouse audit references into a clean metrics array.
 * @param {Object} report - Raw Lighthouse JSON report.
 * @param {string} categoryId - The category ID (e.g., 'seo').
 * @returns {Array<Object>}
 * @private
 */
function _extractMetrics(report, categoryId) {
  const category = report.categories[categoryId];
  if (!category || !category.auditRefs) return [];
  
  return category.auditRefs.map(ref => {
    const audit = report.audits[ref.id] || {};
    return {
      id: ref.id,
      weight: ref.weight,
      score: audit.score,
      title: audit.title,
      description: audit.description,
      displayValue: audit.displayValue
    };
  });
}
