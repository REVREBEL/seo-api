/**
 * Fetch HTML Service
 * A fast, non-headless HTTP client using native fetch to download raw HTML strings for static pages.
 * Includes custom User-Agent rotation mimicking enterprise search crawlers.
 */

const ENTERPRISE_CRAWLER_AGENTS = [
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'Mozilla/5.0 (compatible; Bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  'Mozilla/5.0 (compatible; Yahoo! Slurp; http://help.yahoo.com/help/us/ysearch/slurp)',
  'DuckDuckBot/1.0; (+http://duckduckgo.com/duckduckbot.html)',
  'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)',
  'Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)'
];

function getRandomUserAgent() {
  const randomIndex = Math.floor(Math.random() * ENTERPRISE_CRAWLER_AGENTS.length);
  return ENTERPRISE_CRAWLER_AGENTS[randomIndex];
}

export async function fetchHtml(url, options = {}) {
  const { timeout = 15000, userAgent = getRandomUserAgent() } = options;

  try {
    const fetchOptions = {
      method: 'GET',
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeout)
    };

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      throw new Error(`HTTP fetch failed with status ${response.status} for ${url}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/xml') && !contentType.includes('application/xml')) {
      console.warn(`[fetchHtml] Warning: Content-Type is ${contentType}, expected HTML/XML for ${url}`);
    }

    const html = await response.text();

    return {
      success: true,
      url: response.url,
      status: response.status,
      contentType,
      html
    };
  } catch (error) {
    console.error(`[fetchHtml] Error fetching ${url}:`, error.message);
    
    return {
      success: false,
      url,
      status: null,
      error: error.message,
      html: null
    };
  }
}
