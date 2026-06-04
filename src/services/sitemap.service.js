/**
 * Sitemap Service
 * A streaming sitemap parser processing XML sitemaps chunk-by-chunk via Node streams.
 * Engineered for enterprise-scale URL counts without memory bloating.
 */

import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/**
 * A Transform stream that parses incoming XML chunks and pushes discovered URL objects.
 */
export class SitemapParserStream extends Transform {
  constructor() {
    super({ objectMode: true });
    this.buffer = '';
    // Max buffer size before we start truncating to avoid memory leaks on malformed XML (~2MB)
    this.maxBufferSize = 2 * 1024 * 1024;
  }

  _transform(chunk, encoding, callback) {
    try {
      this.buffer += chunk.toString();

      while (true) {
        // Look for URL blocks
        const startUrlIdx = this.buffer.indexOf('<url>');
        const endUrlIdx = this.buffer.indexOf('</url>');
        
        // Look for Sitemap Index blocks
        const startSitemapIdx = this.buffer.indexOf('<sitemap>');
        const endSitemapIdx = this.buffer.indexOf('</sitemap>');

        let blockStartIdx = -1;
        let blockEndIdx = -1;
        let isSitemapIndex = false;

        // Check if we have a complete <url> block
        if (startUrlIdx !== -1 && endUrlIdx !== -1 && endUrlIdx > startUrlIdx) {
          blockStartIdx = startUrlIdx;
          blockEndIdx = endUrlIdx + 6; // length of '</url>'
        }

        // Check if we have a complete <sitemap> block
        if (startSitemapIdx !== -1 && endSitemapIdx !== -1 && endSitemapIdx > startSitemapIdx) {
          // If it appears earlier than a <url> block, or if no <url> block exists
          if (blockStartIdx === -1 || startSitemapIdx < blockStartIdx) {
            blockStartIdx = startSitemapIdx;
            blockEndIdx = endSitemapIdx + 10; // length of '</sitemap>'
            isSitemapIndex = true;
          }
        }

        // If a complete block was found, parse it
        if (blockStartIdx !== -1) {
          const block = this.buffer.substring(blockStartIdx, blockEndIdx);
          
          const item = {
            type: isSitemapIndex ? 'sitemap' : 'url',
            loc: this._extractTagValue(block, 'loc'),
            lastmod: this._extractTagValue(block, 'lastmod'),
            changefreq: this._extractTagValue(block, 'changefreq'),
            priority: this._extractTagValue(block, 'priority')
          };

          // Remove empty fields
          Object.keys(item).forEach(key => item[key] === null && delete item[key]);

          if (item.loc) {
            this.push(item);
          }

          // Advance the buffer past the processed block
          this.buffer = this.buffer.substring(blockEndIdx);
        } else {
          // No complete blocks found, wait for more chunks
          break;
        }
      }

      // Memory protection: if buffer grows too large without complete blocks,
      // it means the XML is malformed or not a valid sitemap.
      // We truncate it, attempting to keep the tail end that might contain the start of a valid block.
      if (this.buffer.length > this.maxBufferSize) {
        console.warn('[SitemapParser] Buffer size exceeded limits, truncating to prevent memory bloat.');
        const lastOpenBracket = this.buffer.lastIndexOf('<');
        if (lastOpenBracket !== -1 && lastOpenBracket > this.buffer.length - 1000) {
          this.buffer = this.buffer.substring(lastOpenBracket);
        } else {
          this.buffer = ''; // Flush entirely
        }
      }

      callback();
    } catch (error) {
      callback(error);
    }
  }

  /**
   * Quick extraction of tag contents using regex.
   * Safe here since we isolate a small block first.
   * @param {string} xmlBlock 
   * @param {string} tagName 
   * @returns {string|null}
   * @private
   */
  _extractTagValue(xmlBlock, tagName) {
    const regex = new RegExp(`<${tagName}[^>]*>(.*?)<\/${tagName}>`, 'is');
    const match = xmlBlock.match(regex);
    return match ? match[1].trim() : null;
  }
}

/**
 * Fetches and parses a remote sitemap URL chunk-by-chunk.
 * @param {string} url - The URL of the sitemap XML.
 * @param {Function} onDataCallback - Callback invoked for every discovered URL/Sitemap object.
 * @param {Object} options - Configuration options.
 * @returns {Promise<void>} Resolves when the stream fully completes.
 */
export async function parseSitemap(url, onDataCallback, options = {}) {
  const { timeout = 30000 } = options;

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeout),
      headers: {
        'User-Agent': 'REVREBEL/1.0 (Compatible; Sitemap Crawler)'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP fetch failed with status ${response.status}`);
    }

    if (!response.body) {
      throw new Error('No response body stream available.');
    }

    const parser = new SitemapParserStream();
    parser.on('data', onDataCallback);

    // Convert the Web Stream (from fetch) into a Node Stream and pipe it through our parser
    const nodeStream = Transform.fromWeb(response.body);
    await pipeline(nodeStream, parser);

  } catch (error) {
    console.error(`[parseSitemap] Error parsing sitemap ${url}:`, error.message);
    throw error;
  }
}
