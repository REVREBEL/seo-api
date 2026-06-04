/**
 * Fetch HTML Service
 * Fast, non-headless client utilizing a transparent audit identity string.
 */

const AUDIT_USER_AGENT = 'Mozilla/5.0 REVREBEL-WebsiteHealthcheck/1.0 (+https://revrebel.io)';

export async function fetchHtml(url, options = {}) {
  const { timeout = 15000 } = options;

  try {
    const fetchOptions = {
      method: 'GET',
      headers: {
        'User-Agent': AUDIT_USER_AGENT,
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

    const contentType = response.headers.get('content-type') || '';
    const html = await response.text();

    return {
      success: true,
      url: response.url,
      status: response.status,
      contentType,
      html
    };
  } catch (error) {
    console.error(`[fetchHtml] Critical connection failure for ${url}:`, error.message);
    return {
      success: false,
      url,
      status: null,
      error: error.message,
      html: null
    };
  }
}