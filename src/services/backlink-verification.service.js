import * as cheerio from 'cheerio';

import { fetchHtml } from './fetch-html.service.js';
import { validateUrlSecure } from '../utils/security.js';

const DOMAIN_DELAY_MS = 1000;
const domainLastRequest = new Map();

export async function verifyBacklinks({ targetUrl, links = [], headOnly = false, timeout = 30000 }) {
  if (!targetUrl || !validateUrlSecure(targetUrl)) {
    return {
      status: 'error',
      data: null,
      error: `Invalid or blocked target URL: ${targetUrl}`,
      metadata: { source: 'backlink_verifier' }
    };
  }

  const normalizedLinks = Array.isArray(links) ? links : [links];
  const results = [];
  const summary = {
    total: 0,
    verified: 0,
    lost: 0,
    moved: 0,
    link_removed: 0,
    unverifiable_js: 0,
    exists: 0,
    error: 0
  };

  for (const item of normalizedLinks) {
    const sourceUrl = typeof item === 'string' ? item : item?.source_url || item?.sourceUrl;
    if (!sourceUrl) continue;

    summary.total += 1;
    const result = await verifySingleBacklink({ sourceUrl, targetUrl, headOnly, timeout });
    results.push(result);
    const status = result.status || 'error';
    if (status in summary) summary[status] += 1;
    else summary.error += 1;
  }

  return {
    status: 'success',
    data: {
      targetUrl,
      summary,
      results
    },
    error: null,
    metadata: {
      source: 'backlink_verifier',
      headOnly,
      timestamp: new Date().toISOString()
    }
  };
}

export async function verifySingleBacklink({ sourceUrl, targetUrl, headOnly = false, timeout = 30000 }) {
  const result = {
    sourceUrl,
    targetUrl,
    status: 'unknown',
    httpStatus: null,
    targetFound: false,
    matchType: null,
    anchorText: null,
    relAttributes: [],
    linkContext: null,
    error: null
  };

  if (!validateUrlSecure(sourceUrl)) {
    result.status = 'error';
    result.error = 'Source URL blocked by SSRF protection';
    return result;
  }

  const sourceDomain = safeHostname(sourceUrl);
  if (sourceDomain) await politeDelay(sourceDomain);

  const head = await headCheck(sourceUrl, Math.min(timeout, 15000));
  result.httpStatus = head.statusCode;

  if (!head.exists) {
    if (head.statusCode === 404 || head.statusCode === 410) result.status = 'lost';
    else if (head.statusCode && head.statusCode >= 300 && head.statusCode < 400) {
      result.status = 'moved';
      result.redirectUrl = head.redirectUrl;
    } else {
      result.status = 'error';
      result.error = head.error || `HTTP ${head.statusCode}`;
    }
    return result;
  }

  if (headOnly) {
    result.status = 'exists';
    result.targetFound = null;
    return result;
  }

  if (sourceDomain) await politeDelay(sourceDomain);
  const page = await fetchHtml(sourceUrl, { timeout });

  if (!page.success) {
    result.status = 'error';
    result.error = page.error;
    result.httpStatus = page.status;
    return result;
  }

  result.httpStatus = page.status;
  const parsed = parsePageLinks(page.html, sourceUrl);
  const normalizedTarget = normalizeUrlForBacklink(targetUrl);
  const targetDomain = stripWww(safeHostname(targetUrl));

  for (const link of parsed.links) {
    if (!link.href) continue;
    const normalizedHref = normalizeUrlForBacklink(link.href);
    const linkDomain = stripWww(safeHostname(link.href));

    let matchType = null;
    if (normalizedHref === normalizedTarget) matchType = 'exact_url';
    else if (targetDomain && linkDomain === targetDomain) matchType = 'domain_match';
    else if (targetDomain && linkDomain?.endsWith(`.${targetDomain}`)) matchType = 'subdomain_match';

    if (!matchType) continue;

    result.status = 'verified';
    result.targetFound = true;
    result.matchType = matchType;
    result.anchorText = link.text.slice(0, 200);
    result.relAttributes = link.rel.length ? link.rel : ['follow'];
    result.linkContext = link.context;
    return result;
  }

  if (isLikelyJsRendered(page.html, parsed.wordCount)) {
    result.status = 'unverifiable_js';
    result.targetFound = null;
    result.error = 'Page appears JS-rendered; link may exist but cannot be confirmed from static HTML.';
    return result;
  }

  result.status = 'link_removed';
  result.targetFound = false;
  return result;
}

async function headCheck(url, timeout) {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(timeout),
      headers: { 'User-Agent': 'REVREBEL-BacklinkVerifier/1.0 (+https://revrebel.io)' }
    });
    return {
      statusCode: response.status,
      exists: response.status >= 200 && response.status < 300,
      redirectUrl: response.url !== url ? response.url : null,
      error: null
    };
  } catch (error) {
    return { statusCode: null, exists: false, redirectUrl: null, error: error.message };
  }
}

function parsePageLinks(html, baseUrl) {
  const $ = cheerio.load(html || '');
  const links = [];
  $('a[href]').each((_, el) => {
    const href = resolveUrl($(el).attr('href'), baseUrl);
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    links.push({
      href,
      text,
      rel: ($(el).attr('rel') || '').split(/\s+/).filter(Boolean),
      context: $(el).parent().text().replace(/\s+/g, ' ').trim().slice(0, 500)
    });
  });

  const bodyClone = $('body').clone();
  bodyClone.find('script, style, nav, footer, header').remove();
  const visibleText = bodyClone.text().replace(/\s+/g, ' ').trim();
  const wordCount = (visibleText.match(/\b\w+\b/g) || []).length;

  return { links, wordCount };
}

function isLikelyJsRendered(html, wordCount) {
  const lower = String(html || '').toLowerCase();
  const indicators = [
    '<div id="root"',
    '<div id="app"',
    '<div id="__next"',
    '__next_data__',
    '__nuxt',
    'ng-app=',
    'ng-version=',
    'react-root',
    'data-reactroot',
    '_reactlistening'
  ];
  return indicators.some((indicator) => lower.includes(indicator)) || (html.length > 5000 && wordCount < 50);
}

async function politeDelay(domain) {
  const now = Date.now();
  const last = domainLastRequest.get(domain) || 0;
  const elapsed = now - last;
  if (last > 0 && elapsed < DOMAIN_DELAY_MS) {
    await new Promise((resolve) => setTimeout(resolve, DOMAIN_DELAY_MS - elapsed));
  }
  domainLastRequest.set(domain, Date.now());
}

function normalizeUrlForBacklink(value) {
  try {
    const parsed = new URL(value);
    parsed.hash = '';
    parsed.search = '';
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.pathname = parsed.pathname.replace(/\/$/, '') || '/';
    return `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`;
  } catch {
    return String(value || '').trim().toLowerCase().replace(/\/$/, '');
  }
}

function safeHostname(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function stripWww(value) {
  return value?.startsWith('www.') ? value.slice(4) : value;
}

function resolveUrl(value, baseUrl) {
  if (!value) return null;
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return value;
  }
}
