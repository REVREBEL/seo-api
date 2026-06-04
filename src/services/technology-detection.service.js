/**
 * Technology Detection Service
 * A lightweight, clean-room signature scanning engine inspired by Wappalyzer.
 * Examines response headers and raw DOM structures for enterprise web fingerprints.
 */

// Key commercial, hospitality, and performance signatures
const TECH_SIGNATURES = [
  { name: 'Adobe Experience Manager', headers: { 'X-Adobe-Processor': /.*/, 'Server': /Communique/ }, html: [/src=".*\/etc\.clientlibs\//, /<div[^>]*class=".*aem.*/] },
  { name: 'WordPress', headers: { 'X-Powered-By': /WP/ }, html: [/<meta[^>]*name="generator"[^>]*content="WordPress/i, /\/wp-content\//] },
  { name: 'Shopify', headers: { 'Server': /shopify/i }, html: [/cdn\.shopify\.com/, /Shopify\.shop/] },
  { name: 'Cloudflare', headers: { 'Server': /^cloudflare$/i, 'CF-RAY': /.*/ }, html: [] },
  { name: 'Akamai', headers: { 'X-Akamai-Transformed': /.*/, 'Server': /AkamaiGHost/ }, html: [] },
  { name: 'SynXis (Sabre Hospitality)', headers: {}, html: [/be\.synxis\.com/, /booking\.synxis\.com/] },
  { name: 'Amadeus (iHotelier)', headers: {}, html: [/ihotelier\.com/, /jsecure\.ihotelier\.com/] },
  { name: 'Google Analytics', headers: {}, html: [/googletagmanager\.com\/gtag\/js/, /ga\.js/, /analytics\.js/] }
];

/**
 * Detects software, CDNs, and booking infrastructure from headers and HTML context.
 * @param {string} htmlString - Fully rendered HTML string.
 * @param {Object} responseHeaders - Key-value pair object of the network response headers.
 * @returns {Array<string>} Detected technology framework profiles.
 */
export function detectTechnologies(htmlString, responseHeaders = {}) {
  const detected = new Set();

  // Normalize header keys for safe lookup
  const normalizedHeaders = {};
  Object.keys(responseHeaders).forEach(key => {
    normalizedHeaders[key.toLowerCase()] = String(responseHeaders[key]);
  });

  for (const tech of TECH_SIGNATURES) {
    // 1. Check Header Matches
    if (tech.headers) {
      for (const [headerKey, regex] of Object.entries(tech.headers)) {
        const value = normalizedHeaders[headerKey.toLowerCase()];
        if (value && regex.test(value)) {
          detected.add(tech.name);
        }
      }
    }

    // 2. Check HTML Fingerprints
    if (tech.html && htmlString) {
      for (const regex of tech.html) {
        if (regex.test(htmlString)) {
          detected.add(tech.name);
        }
      }
    }
  }

  return Array.from(detected);
}