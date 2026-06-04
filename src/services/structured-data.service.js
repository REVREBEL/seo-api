/**
 * Structured Data Service
 * Safely parses the DOM string to extract all inline application/ld+json blocks,
 * Microdata formats, and OpenGraph/Twitter meta tags.
 * Returns a normalized, structured JSON object mapping the page's semantic metadata schema.
 */

import * as cheerio from 'cheerio';

/**
 * Extracts structured data and metadata from raw HTML.
 * @param {string} htmlString - The fully rendered DOM string.
 * @returns {Object} A normalized JSON object containing schemas and meta tags.
 */
export function extractStructuredData(htmlString) {
  const $ = cheerio.load(htmlString);
  const result = {
    jsonLd: [],
    microdata: [],
    openGraph: {},
    twitter: {},
    metaTags: {}
  };

  try {
    // 1. Extract JSON-LD blocks
    $('script[type="application/ld+json"]').each((i, el) => {
      try {
        const content = $(el).html();
        if (content) {
          const parsed = JSON.parse(content);
          // JSON-LD can be a single object or an array of objects
          if (Array.isArray(parsed)) {
            result.jsonLd.push(...parsed);
          } else {
            result.jsonLd.push(parsed);
          }
        }
      } catch (err) {
        console.warn('[StructuredData] Failed to parse a JSON-LD script block:', err.message);
      }
    });

    // 2. Extract OpenGraph, Twitter, and Standard Meta Tags
    $('meta').each((i, el) => {
      const property = $(el).attr('property');
      const name = $(el).attr('name');
      const content = $(el).attr('content');

      if (content) {
        // OpenGraph tags usually use the 'property' attribute (e.g., property="og:title")
        if (property && property.startsWith('og:')) {
          result.openGraph[property] = content;
        }
        // Twitter card tags usually use the 'name' attribute (e.g., name="twitter:card")
        else if (name && name.startsWith('twitter:')) {
          result.twitter[name] = content;
        }
        // Standard meta tags (e.g., name="description")
        else if (name) {
          result.metaTags[name] = content;
        }
      }
    });

    // 3. Extract Microdata (itemscope, itemtype, itemprop)
    // We isolate top-level scopes (those not contained within another scope, unless they are distinct)
    // For a cleaner extraction without a full RDF parser, we just pull flat properties per item.
    $('[itemscope]').each((i, el) => {
      const itemtype = $(el).attr('itemtype');
      if (itemtype) {
        const item = { '@type': itemtype };
        
        // Find all itemprops within this scope
        $(el).find('[itemprop]').each((j, childEl) => {
          const propName = $(childEl).attr('itemprop');
          if (propName) {
            // Prioritize standard data attributes before falling back to text
            let propValue = $(childEl).attr('content') || 
                            $(childEl).attr('href') || 
                            $(childEl).attr('src') || 
                            $(childEl).text().trim();
            
            // If the property already exists, convert to an array to handle multiples
            if (item[propName]) {
              if (!Array.isArray(item[propName])) {
                item[propName] = [item[propName]];
              }
              item[propName].push(propValue);
            } else {
              item[propName] = propValue;
            }
          }
        });
        
        result.microdata.push(item);
      }
    });

  } catch (error) {
    console.error('[StructuredData] Critical error during DOM parsing:', error.message);
  }

  return result;
}
