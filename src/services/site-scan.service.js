import * as cheerio from 'cheerio';

import { fetchHtml } from './fetch-html.service.js';
import { parseSitemap } from './sitemap.service.js';
import { extractStructuredData } from './structured-data.service.js';
import { analyzeHtmlQuality } from './html-quality.service.js';
import { analyzeContentQuality } from './content-quality.service.js';
import { analyzeLinkGraph } from './linkgraph.service.js';
import { fetchRobotsTxt } from './robots.service.js';
import { validateUrlSecure } from '../utils/security.js';

export async function runSiteScan({
  url,
  maxPages = 50,
  concurrency = 3,
  includeHtmlSnapshot = false,
  includeSitemap = true,
  includeLinkGraph = true,
  timeoutMs = 20000
}) {
  if (!url || !validateUrlSecure(url)) {
    return {
      success: false,
      error: 'Invalid or blocked target URL.'
    };
  }

  const startedAt = new Date().toISOString();
  const root = new URL(url);
  const robots = await fetchRobotsTxt(root.href);
  const sitemapInventory = includeSitemap
    ? await collectSitemapInventory(root.href, { maxPages, timeoutMs })
    : { urls: [{ url: root.href, sourceSitemap: null }], sources: {}, errors: [] };

  const urls = dedupeUrls(sitemapInventory.urls.map((item) => item.url)).slice(0, maxPages);
  const pages = await runPool(urls, Math.max(1, Math.min(10, concurrency)), async (pageUrl) => {
    return collectPageEvidence(pageUrl, {
      rootUrl: root.href,
      robots,
      includeHtmlSnapshot,
      timeoutMs
    });
  });

  const crawlPages = pages
    .filter((page) => page.status === 'completed')
    .map((page) => ({
      url: page.url,
      title: page.html?.title || '',
      depth: page.url === root.href ? 0 : null,
      status: page.fetch?.status || null,
      linksOut: page.html?.links?.map((link) => link.href).filter(Boolean) || []
    }));

  const linkGraph = includeLinkGraph ? analyzeLinkGraph(crawlPages, { top: 25 }) : null;

  return {
    success: true,
    target: {
      inputUrl: url,
      origin: `${root.protocol}//${root.host}`
    },
    collection: {
      collectorVersion: 'revrebel-seo-api/site-scan-1.0.0',
      startedAt,
      completedAt: new Date().toISOString(),
      maxPages,
      concurrency,
      includeHtmlSnapshot,
      includeSitemap,
      includeLinkGraph,
      timeoutMs
    },
    sitemap: sitemapInventory,
    summary: summarizeSiteScan({ pages, sitemapInventory }),
    pages,
    linkGraph
  };
}

async function collectPageEvidence(pageUrl, { rootUrl, robots, includeHtmlSnapshot, timeoutMs }) {
  const startedAt = new Date().toISOString();

  try {
    const fetched = await fetchHtml(pageUrl, { timeout: timeoutMs });
    if (!fetched.success) {
      return {
        url: pageUrl,
        status: 'failed',
        error: fetched.error || 'fetch failed',
        fetch: summarizeFetch(fetched),
        collectedAt: startedAt
      };
    }

    const html = extractHtmlEvidence(fetched.html, fetched.url || pageUrl, rootUrl, robots);
    const structuredData = extractStructuredData(fetched.html);
    const htmlQuality = analyzeHtmlQuality({ html: fetched.html, source: fetched.url || pageUrl });
    const contentQuality = analyzeContentQuality(html.visibleText || '');

    const pageEvidence = {
      url: fetched.url || pageUrl,
      requestedUrl: pageUrl,
      status: 'completed',
      collectedAt: startedAt,
      fetch: summarizeFetch(fetched),
      html,
      structuredData: summarizeStructuredData(structuredData),
      htmlQuality,
      contentQuality
    };

    if (includeHtmlSnapshot) pageEvidence.rawHtml = fetched.html;
    return pageEvidence;
  } catch (error) {
    return {
      url: pageUrl,
      status: 'failed',
      error: error.message,
      collectedAt: startedAt
    };
  }
}

async function collectSitemapInventory(url, { maxPages, timeoutMs }) {
  const root = new URL(url);
  const robots = await fetchRobotsTxt(root.href);
  const seedSitemaps = new Set([`${root.protocol}//${root.host}/sitemap.xml`]);
  for (const sitemap of robots.getSitemaps()) {
    if (validateUrlSecure(sitemap)) seedSitemaps.add(sitemap);
  }

  const queue = [...seedSitemaps];
  const visited = new Set();
  const urls = [];
  const errors = [];
  const maxSitemaps = 50;

  while (queue.length && visited.size < maxSitemaps && urls.length < maxPages) {
    const sitemapUrl = queue.shift();
    if (!sitemapUrl || visited.has(sitemapUrl)) continue;
    visited.add(sitemapUrl);

    try {
      await parseSitemap(sitemapUrl, (item) => {
        if (!item?.loc || !validateUrlSecure(item.loc)) return;
        if (item.type === 'sitemap') {
          if (!visited.has(item.loc) && queue.length + visited.size < maxSitemaps) queue.push(item.loc);
          return;
        }
        if (urls.length < maxPages) {
          urls.push({
            url: item.loc,
            lastmod: item.lastmod || null,
            changefreq: item.changefreq || null,
            priority: item.priority ? Number(item.priority) : null,
            sourceSitemap: sitemapUrl,
            sourceType: item.sourceType || 'sitemap'
          });
        }
      }, { timeout: timeoutMs });
    } catch (error) {
      errors.push({ sitemapUrl, message: error.message });
    }
  }

  if (urls.length === 0) {
    urls.push({ url: root.href, sourceSitemap: null, sourceType: 'fallback-root' });
  }

  return {
    urls,
    sources: {
      seedSitemaps: [...seedSitemaps],
      fetchedSitemaps: [...visited],
      robotsSitemaps: robots.getSitemaps()
    },
    errors,
    summary: {
      discoveredUrlCount: urls.length,
      fetchedSitemapCount: visited.size,
      errorCount: errors.length
    }
  };
}

function extractHtmlEvidence(htmlString, finalUrl, rootUrl, robots) {
  const $ = cheerio.load(htmlString || '');
  const canonical = $('link[rel="canonical"]').attr('href')?.trim() || null;
  const metaRobots = $('meta[name="robots"]').attr('content')?.trim() || null;
  const baseHost = safeHostname(rootUrl);
  const links = [];
  const images = [];
  const hreflang = [];

  $('link[rel="alternate"]').each((_, el) => {
    const lang = $(el).attr('hreflang');
    if (lang) hreflang.push({ lang, href: resolveUrl($(el).attr('href'), finalUrl) });
  });

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (!href || href.startsWith('#') || href.toLowerCase().startsWith('javascript:')) return;
    const resolved = resolveUrl(href, finalUrl);
    links.push({
      href: resolved,
      text: $(el).text().replace(/\s+/g, ' ').trim().slice(0, 250),
      rel: ($(el).attr('rel') || '').split(/\s+/).filter(Boolean),
      internal: safeHostname(resolved) === baseHost
    });
  });

  $('img').each((_, el) => {
    images.push({
      src: resolveUrl($(el).attr('src'), finalUrl),
      alt: $(el).attr('alt') ?? null,
      loading: $(el).attr('loading') || null,
      width: $(el).attr('width') || null,
      height: $(el).attr('height') || null
    });
  });

  const bodyClone = $('body').clone();
  bodyClone.find('script, style, nav, footer, header').remove();
  const visibleText = bodyClone.text().replace(/\s+/g, ' ').trim();

  return {
    title: $('title').text().trim() || null,
    titleLength: ($('title').text().trim() || '').length,
    description: $('meta[name="description"]').attr('content')?.trim() || null,
    descriptionLength: ($('meta[name="description"]').attr('content')?.trim() || '').length,
    canonical,
    canonicalComparison: compareCanonical(canonical, finalUrl),
    metaRobots,
    isNoindexPresent: (metaRobots || '').toLowerCase().includes('noindex'),
    robotsDecision: robots.canFetch('REVREBEL-Bot', finalUrl),
    htmlLang: $('html').attr('lang') || null,
    viewport: $('meta[name="viewport"]').attr('content') || null,
    headings: {
      h1: textList($, 'h1'),
      h2: textList($, 'h2'),
      h3: textList($, 'h3')
    },
    hreflang,
    openGraph: metaMap($, 'property', 'og:'),
    twitter: metaMap($, 'name', 'twitter:'),
    wordCount: (visibleText.match(/\b\w+\b/g) || []).length,
    visibleText,
    links,
    linkCount: links.length,
    internalLinkCount: links.filter((link) => link.internal).length,
    externalLinkCount: links.filter((link) => !link.internal).length,
    images,
    imageCount: images.length,
    missingImgAltCount: images.filter((image) => image.alt === null || image.alt === '').length
  };
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let index = 0;

  async function next() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current], current);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, next));
  return results;
}

function summarizeSiteScan({ pages, sitemapInventory }) {
  const completed = pages.filter((page) => page.status === 'completed');
  const failed = pages.filter((page) => page.status !== 'completed');
  const schemaTypes = new Set();

  for (const page of completed) {
    for (const type of page.structuredData?.schemaTypesFound || []) schemaTypes.add(type);
  }

  return {
    discoveredUrls: sitemapInventory.summary?.discoveredUrlCount || sitemapInventory.urls.length,
    auditedUrls: pages.length,
    completedUrls: completed.length,
    failedUrls: failed.length,
    pagesMissingTitle: completed.filter((page) => !page.html?.title).length,
    pagesMissingMetaDescription: completed.filter((page) => !page.html?.description).length,
    pagesMissingH1: completed.filter((page) => (page.html?.headings?.h1 || []).length === 0).length,
    pagesNoindex: completed.filter((page) => page.html?.isNoindexPresent).length,
    pagesMissingCanonical: completed.filter((page) => !page.html?.canonical).length,
    pagesWithSchema: completed.filter((page) => (page.structuredData?.schemaTypesFound || []).length > 0).length,
    schemaTypesFound: [...schemaTypes].sort(),
    totalInternalLinks: completed.reduce((sum, page) => sum + (page.html?.internalLinkCount || 0), 0),
    totalExternalLinks: completed.reduce((sum, page) => sum + (page.html?.externalLinkCount || 0), 0),
    totalMissingImageAlt: completed.reduce((sum, page) => sum + (page.html?.missingImgAltCount || 0), 0)
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
    error: fetchResult.error || null
  };
}

function summarizeStructuredData(structuredData) {
  return {
    jsonLdBlockCount: structuredData.jsonLdBlockCount,
    jsonLdNodeCount: structuredData.jsonLdNodeCount,
    microdataBlockCount: structuredData.microdataBlockCount,
    schemaTypesFound: structuredData.schemaTypesFound,
    openGraph: structuredData.openGraph,
    twitter: structuredData.twitter,
    parseErrors: structuredData.parseErrors,
    lint: structuredData.lint,
    ecommerceValidation: structuredData.ecommerceValidation
  };
}

function dedupeUrls(urls) {
  const seen = new Set();
  const out = [];
  for (const url of urls) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

function textList($, selector) {
  return $(selector).map((_, el) => $(el).text().replace(/\s+/g, ' ').trim()).get().filter(Boolean);
}

function metaMap($, attr, prefix) {
  const map = {};
  $(`meta[${attr}]`).each((_, el) => {
    const key = $(el).attr(attr);
    const content = $(el).attr('content');
    if (key && key.startsWith(prefix) && content) map[key] = content;
  });
  return map;
}

function resolveUrl(value, baseUrl) {
  if (!value) return null;
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return value;
  }
}

function safeHostname(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

function compareCanonical(canonical, finalUrl) {
  return {
    canonical,
    finalUrl,
    exactMatch: canonical === finalUrl,
    normalizedCanonical: normalizeUrlForComparison(canonical),
    normalizedFinalUrl: normalizeUrlForComparison(finalUrl),
    normalizedMatch: normalizeUrlForComparison(canonical) === normalizeUrlForComparison(finalUrl)
  };
}

function normalizeUrlForComparison(input) {
  if (!input) return null;
  try {
    const parsed = new URL(input);
    parsed.hash = '';
    parsed.search = '';
    let normalized = parsed.toString().toLowerCase();
    if (parsed.pathname === '/') normalized = normalized.replace(/\/$/, '');
    return normalized;
  } catch {
    return String(input).trim().toLowerCase().replace(/\/$/, '');
  }
}
