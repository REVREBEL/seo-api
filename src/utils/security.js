/**
 * Security & Validation Engine
 * Implements strict API key validation and SSRF firewall protection.
 */

// Basic private/loopback IP ranges
const PRIVATE_IP_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^0\./
];

/**
 * Validates inbound URLs to protect against protocol switching and SSRF leaks.
 * @param {string} urlString 
 * @returns {boolean}
 */
export function validateUrlSecure(urlString) {
  try {
    const parsed = new URL(urlString);
    
    // 1. Protocol Locking
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    const hostname = parsed.hostname;

    // 2. Local Loopback & Private Range Firewall
    const isUnsafe = PRIVATE_IP_PATTERNS.some(pattern => pattern.test(hostname));
    return !isUnsafe;

  } catch {
    return false;
  }
}

/**
 * Middleware to protect administrative routes via static token exchange.
 */
export function requireApiKey(req, res, next) {
  let targetKey = process.env.REVREBEL_API_KEY;
  if (!targetKey && process.env.NODE_ENV !== 'production') {
    targetKey = 'rebel-default-development-key';
  }

  const inboundKey = req.headers['x-api-key'];

  if (!inboundKey || inboundKey !== targetKey) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Missing or invalid x-api-key.' });
  }
  next();
}