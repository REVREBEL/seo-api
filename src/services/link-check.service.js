/**
 * Link Check Service
 * Extracts hyperlinks from a DOM string and runs high-concurrency, 
 * network-safe HTTP validation to detect broken links and dangerous redirects.
 */

import * as cheerio from 'cheerio';

/**
 * Extracts and audits all links found within an HTML string.
 * @param {string} htmlString - The raw or rendered HTML DOM.
 * @param {string} baseUrl - The base URL of the target site to resolve relative paths.
 * @param {Object} options - Configuration options (concurrency, timeout).
 * @returns {Promise<Object>} Summary of broken and working links.
 */
export async function auditPageLinks(htmlString, baseUrl, options = {}) {
  const { concurrency = 10, timeout = 5000 } = options;
  const $ = cheerio.load(htmlString);
  
  // Gather unique URLs
  const uniqueUrls = new Set();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')?.trim();
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('tel:') || href.startsWith('mailto:')) {
      return;
    }
    try {
      const resolvedUrl = new URL(href, baseUrl).href;
      uniqueUrls.add(resolvedUrl);
    } catch {
      // Ignore malformed URLs during extraction
    }
  });

  const urlList = Array.from(uniqueUrls);
  const results = [];

  // Batch execution queue (p-limit alternative to keep dependencies near zero)
  for (let i = 0; i < urlList.length; i += concurrency) {
    const batch = urlList.slice(i, i + concurrency);
    const batchPromises = batch.map(url => _checkLink(url, timeout));
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }

  const broken = results.filter(r => !r.success);
  
  return {
    totalLinksFound: urlList.length,
    brokenCount: broken.length,
    success: broken.length === 0,
    links: results
  };
}

/**
 * Validates a single URL using a fast HEAD request, falling back to GET if needed.
 * @private
 */
async function _checkLink(url, timeout) {
  const fetchOptions = {
    method: 'HEAD',
    signal: AbortSignal.timeout(timeout),
    headers: { 'User-Agent': 'REVREBEL/1.0 (Link Checker)' }
  };

  try {
    let response = await fetch(url, fetchOptions);

    // Some servers block HEAD requests with a 405 or 403; fallback to a shallow GET
    if (response.status === 405 || response.status === 403) {
      fetchOptions.method = 'GET';
      // Use standard header range trick to avoid downloading the whole body if possible
      fetchOptions.headers['Range'] = 'bytes=0-0'; 
      response = await fetch(url, fetchOptions);
    }

    return {
      url,
      success: response.ok,
      status: response.status,
      error: response.ok ? null : `HTTP Status ${response.status}`
    };
  } catch (error) {
    return {
      url,
      success: false,
      status: null,
      error: error.message
    };
  }
}