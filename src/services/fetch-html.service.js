/**
 * Fetch HTML Service
 * Fast, non-headless client utilizing a transparent audit identity string.
 */

const AUDIT_USER_AGENT = 'Mozilla/5.0 REVREBEL-WebsiteHealthcheck/1.0 (+https://revrebel.io)';
const GOOGLEBOT_USER_AGENT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

export async function fetchHtml(url, options = {}) {
  const { timeout = 15000, userAgent = AUDIT_USER_AGENT } = options;

  try {
    const fetchOptions = {
      method: 'GET',
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeout)
    };

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      throw new Error(`HTTP status processing error: ${response.status}`);
    }

    const headers = Object.fromEntries(response.headers.entries());
    const contentType = response.headers.get('content-type') || '';
    const html = await response.text();

    return {
      success: true,
      requestedUrl: url,
      url: response.url,
      status: response.status,
      redirected: response.url !== url,
      redirectChain: response.url !== url ? [url, response.url] : [],
      contentType,
      headers,
      xRobotsTag: response.headers.get('x-robots-tag') || null,
      contentLength: html.length,
      userAgent,
      html
    };
  } catch (error) {
    console.error(`[fetchHtml] Critical connection failure for ${url}:`, error.message);
    return {
      success: false,
      requestedUrl: url,
      url,
      status: null,
      error: error.message,
      headers: {},
      html: null
    };
  }
}

export async function compareDefaultAndGooglebotFetch(url, options = {}) {
  const timeout = options.timeout || 15000;
  const [defaultFetch, googlebotFetch] = await Promise.all([
    fetchHtml(url, { timeout, userAgent: AUDIT_USER_AGENT }),
    fetchHtml(url, { timeout, userAgent: GOOGLEBOT_USER_AGENT })
  ]);

  return {
    defaultFetch: summarizeFetch(defaultFetch),
    googlebotFetch: summarizeFetch(googlebotFetch),
    dynamicRenderingEvidence: {
      statusDiffers: defaultFetch.status !== googlebotFetch.status,
      finalUrlDiffers: defaultFetch.url !== googlebotFetch.url,
      contentLengthDelta: Math.abs((defaultFetch.contentLength || 0) - (googlebotFetch.contentLength || 0)),
      contentLengthRatio: ratio(defaultFetch.contentLength, googlebotFetch.contentLength)
    }
  };
}

function summarizeFetch(fetchResult) {
  return {
    success: fetchResult.success,
    requestedUrl: fetchResult.requestedUrl,
    finalUrl: fetchResult.url,
    status: fetchResult.status,
    redirected: fetchResult.redirected,
    redirectChain: fetchResult.redirectChain || [],
    contentType: fetchResult.contentType,
    xRobotsTag: fetchResult.xRobotsTag || null,
    contentLength: fetchResult.contentLength || 0,
    userAgent: fetchResult.userAgent || null,
    error: fetchResult.error || null
  };
}

function ratio(a, b) {
  if (!a || !b) return null;
  const high = Math.max(a, b);
  const low = Math.min(a, b);
  return Number((high / low).toFixed(3));
}
