import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { gunzipSync } from 'node:zlib';

const MD_LINK_PATTERN = /\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/gi;
const BARE_URL_PATTERN = /(?<![\w(])https?:\/\/[^\s<>\")]+/gi;

export class SitemapParserStream extends Transform {
  constructor() {
    super({ objectMode: true });
    this.buffer = '';
    this.maxBufferSize = 2 * 1024 * 1024;
  }

  _transform(chunk, encoding, callback) {
    try {
      this.buffer += chunk.toString();
      this._flushCompleteBlocks();

      if (this.buffer.length > this.maxBufferSize) {
        console.warn('[SitemapParser] Buffer size exceeded limits, truncating to prevent memory bloat.');
        const lastOpenBracket = this.buffer.lastIndexOf('<');
        this.buffer = lastOpenBracket !== -1 && lastOpenBracket > this.buffer.length - 1000
          ? this.buffer.substring(lastOpenBracket)
          : '';
      }

      callback();
    } catch (error) {
      callback(error);
    }
  }

  _flush(callback) {
    try {
      this._flushCompleteBlocks();
      callback();
    } catch (error) {
      callback(error);
    }
  }

  _flushCompleteBlocks() {
    while (true) {
      const next = findNextCompleteBlock(this.buffer);
      if (!next) break;

      const block = this.buffer.substring(next.start, next.end);
      const item = {
        type: next.type,
        loc: extractTagValue(block, 'loc'),
        lastmod: extractTagValue(block, 'lastmod'),
        changefreq: extractTagValue(block, 'changefreq'),
        priority: extractTagValue(block, 'priority')
      };

      Object.keys(item).forEach((key) => item[key] === null && delete item[key]);
      if (item.loc) this.push(item);
      this.buffer = this.buffer.substring(next.end);
    }
  }
}

export async function parseSitemap(url, onDataCallback, options = {}) {
  const { timeout = 30000 } = options;

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeout),
      headers: {
        'User-Agent': 'REVREBEL/1.0 (Compatible; Sitemap Crawler)',
        'Accept': 'application/xml,text/xml,text/plain,*/*;q=0.8',
        'Accept-Encoding': 'gzip, br, deflate'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP fetch failed with status ${response.status}`);
    }

    const finalUrl = response.url || url;

    if (isLlmsTxtUrl(finalUrl)) {
      const text = await response.text();
      for (const loc of parseLlmsTxt(text)) {
        onDataCallback({ type: 'url', loc, sourceType: 'llms.txt' });
      }
      return;
    }

    if (!response.body) {
      throw new Error('No response body stream available.');
    }

    if (finalUrl.toLowerCase().endsWith('.gz')) {
      const bytes = Buffer.from(await response.arrayBuffer());
      const body = maybeGunzip(bytes, finalUrl).toString('utf8');
      parseSitemapText(body, onDataCallback);
      return;
    }

    const parser = new SitemapParserStream();
    parser.on('data', onDataCallback);
    const nodeStream = Transform.fromWeb(response.body);
    await pipeline(nodeStream, parser);
  } catch (error) {
    console.error(`[parseSitemap] Error parsing sitemap ${url}:`, error.message);
    throw error;
  }
}

export function parseSitemapText(xmlText, onDataCallback) {
  let buffer = xmlText || '';
  while (true) {
    const next = findNextCompleteBlock(buffer);
    if (!next) break;

    const block = buffer.substring(next.start, next.end);
    const item = {
      type: next.type,
      loc: extractTagValue(block, 'loc'),
      lastmod: extractTagValue(block, 'lastmod'),
      changefreq: extractTagValue(block, 'changefreq'),
      priority: extractTagValue(block, 'priority')
    };

    Object.keys(item).forEach((key) => item[key] === null && delete item[key]);
    if (item.loc) onDataCallback(item);
    buffer = buffer.substring(next.end);
  }
}

export function parseLlmsTxt(text) {
  const urls = [];
  const seen = new Set();
  const add = (value) => {
    const url = String(value || '').replace(/[.,);]+$/g, '');
    if (url && !seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  };

  for (const match of text.matchAll(MD_LINK_PATTERN)) add(match[1]);
  for (const match of text.matchAll(BARE_URL_PATTERN)) add(match[0]);
  return urls;
}

function findNextCompleteBlock(buffer) {
  const urlStart = findTagStart(buffer, 'url');
  const sitemapStart = findTagStart(buffer, 'sitemap');

  let type = null;
  let start = -1;

  if (urlStart !== -1 && (sitemapStart === -1 || urlStart < sitemapStart)) {
    type = 'url';
    start = urlStart;
  } else if (sitemapStart !== -1) {
    type = 'sitemap';
    start = sitemapStart;
  }

  if (!type) return null;

  const end = findTagEnd(buffer, type, start);
  if (end === -1) return null;

  return { type, start, end };
}

function findTagStart(buffer, localName) {
  const pattern = new RegExp(`<([A-Za-z0-9_-]+:)?${localName}\\b[^>]*>`, 'i');
  const match = pattern.exec(buffer);
  return match ? match.index : -1;
}

function findTagEnd(buffer, localName, start) {
  const pattern = new RegExp(`<\\/([A-Za-z0-9_-]+:)?${localName}>`, 'i');
  const match = pattern.exec(buffer.substring(start));
  return match ? start + match.index + match[0].length : -1;
}

function extractTagValue(xmlBlock, tagName) {
  const regex = new RegExp(`<([A-Za-z0-9_-]+:)?${tagName}\\b[^>]*>([\\s\\S]*?)<\\/([A-Za-z0-9_-]+:)?${tagName}>`, 'i');
  const match = xmlBlock.match(regex);
  return match ? decodeXmlEntity(match[2].trim()) : null;
}

function maybeGunzip(body, url) {
  const looksGzip = url.toLowerCase().endsWith('.gz') || (body[0] === 0x1f && body[1] === 0x8b);
  if (!looksGzip) return body;

  try {
    return gunzipSync(body);
  } catch {
    return body;
  }
}

function isLlmsTxtUrl(url) {
  return String(url || '').replace(/\/+$/, '').toLowerCase().endsWith('/llms.txt') ||
    String(url || '').toLowerCase().endsWith('llms.txt');
}

function decodeXmlEntity(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
