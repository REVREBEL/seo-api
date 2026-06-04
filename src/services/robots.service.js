/**
 * Robots.txt Service
 * A clean-room utility for fetching and parsing robots.txt files.
 * Parses Allow/Disallow/Sitemap rules and exposes an `isAllowed(url, userAgent)` method.
 */

export class RobotsParser {
  /**
   * Initializes the parser with the raw robots.txt content.
   * @param {string} robotsTxtContent - The raw text of the robots.txt file.
   */
  constructor(robotsTxtContent) {
    // rules map: user-agent -> { allow: [paths], disallow: [paths] }
    this.rules = {};
    this.sitemaps = [];
    this._parse(robotsTxtContent || '');
  }

  /**
   * Parses the robots.txt line by line.
   * @param {string} content - The robots.txt text.
   * @private
   */
  _parse(content) {
    const lines = content.split(/\r?\n/);
    let currentUserAgents = [];

    for (let line of lines) {
      // Strip comments and trim whitespace
      line = line.split('#')[0].trim();
      if (!line) continue;

      // Extract directive and value
      const delimiterIndex = line.indexOf(':');
      if (delimiterIndex === -1) continue;

      const directive = line.substring(0, delimiterIndex).trim().toLowerCase();
      const value = line.substring(delimiterIndex + 1).trim();

      if (directive === 'user-agent') {
        const agent = value.toLowerCase();
        // If we encounter a new User-Agent after already collecting rules,
        // it means we are starting a new block, but standard states consecutive User-Agents
        // belong to the same block. For simplicity, we just add to currentUserAgents.
        // If we see a User-Agent, we should check if we just finished a rule block to reset.
        if (this._lastLineWasRule) {
          currentUserAgents = [];
          this._lastLineWasRule = false;
        }
        
        currentUserAgents.push(agent);
        if (!this.rules[agent]) {
          this.rules[agent] = { allow: [], disallow: [] };
        }
      } else if (directive === 'allow' || directive === 'disallow') {
        this._lastLineWasRule = true;
        
        // If no user-agent was specified before a rule, assume '*'
        if (currentUserAgents.length === 0) {
          currentUserAgents = ['*'];
          if (!this.rules['*']) this.rules['*'] = { allow: [], disallow: [] };
        }

        // Add the rule to all active user-agents in the current block
        for (const agent of currentUserAgents) {
          if (value) {
            this.rules[agent][directive].push(value);
          } else if (directive === 'disallow') {
            // "Disallow: " (empty) means allow everything, which is the default.
            // We can safely ignore it.
          }
        }
      } else if (directive === 'sitemap') {
        if (value) {
          this.sitemaps.push(value);
        }
      }
    }
  }

  /**
   * Converts a robots.txt path pattern to a RegExp.
   * Handles '*' wildcards and '$' end anchors.
   * @param {string} pathPattern 
   * @returns {RegExp}
   * @private
   */
  _patternToRegex(pathPattern) {
    // Escape special regex characters except * and $
    let regexStr = pathPattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    // Convert robots wildcard '*' to regex '.*'
    regexStr = regexStr.replace(/\*/g, '.*');
    // Handle robots end anchor '$'
    if (regexStr.endsWith('\\$')) {
      regexStr = regexStr.slice(0, -2) + '$';
    }
    return new RegExp('^' + regexStr);
  }

  /**
   * Determines if a specific URL is allowed for a given user-agent.
   * @param {string} targetUrl - The full URL or relative path to check.
   * @param {string} [userAgent='*'] - The user-agent to evaluate against.
   * @returns {boolean} True if allowed, false if disallowed.
   */
  isAllowed(targetUrl, userAgent = '*') {
    try {
      // Extract pathname and search string (e.g. /path?query=1)
      const urlObj = new URL(targetUrl, 'http://dummy.local');
      const urlPath = urlObj.pathname + urlObj.search;
      
      const agent = userAgent.toLowerCase();
      
      // Get rules specific to the agent, fallback to '*' if none
      let applicableRules = this.rules[agent];
      if (!applicableRules || (applicableRules.allow.length === 0 && applicableRules.disallow.length === 0)) {
        applicableRules = this.rules['*'] || { allow: [], disallow: [] };
      }

      let allowed = true;
      let longestMatchLength = 0;

      // Check disallow rules
      for (const disallowPath of applicableRules.disallow) {
        if (this._patternToRegex(disallowPath).test(urlPath)) {
          if (disallowPath.length > longestMatchLength) {
            allowed = false;
            longestMatchLength = disallowPath.length;
          }
        }
      }

      // Check allow rules (these override disallow if they are longer/more specific)
      for (const allowPath of applicableRules.allow) {
        if (this._patternToRegex(allowPath).test(urlPath)) {
          if (allowPath.length > longestMatchLength) {
            allowed = true;
            longestMatchLength = allowPath.length;
          }
        }
      }

      return allowed;
    } catch (error) {
      console.warn(`[RobotsParser] Invalid URL format provided to isAllowed: ${targetUrl}`);
      return false; // Fail safe
    }
  }

  /**
   * Returns all sitemap URLs discovered in the robots.txt.
   * @returns {string[]}
   */
  getSitemaps() {
    return this.sitemaps;
  }
}

/**
 * Fetches and parses a domain's robots.txt.
 * @param {string} domainUrl - The base URL of the domain (e.g., https://example.com).
 * @param {Object} options - Fetch options.
 * @param {number} options.timeout - Timeout in milliseconds.
 * @returns {Promise<RobotsParser>} A populated RobotsParser instance.
 */
export async function fetchRobotsTxt(domainUrl, options = {}) {
  const { timeout = 10000 } = options;

  try {
    const urlObj = new URL(domainUrl);
    const robotsUrl = `${urlObj.protocol}//${urlObj.host}/robots.txt`;

    const response = await fetch(robotsUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeout)
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        // Disallow all if we are explicitly forbidden from reading robots.txt
        return new RobotsParser('User-agent: *\nDisallow: /');
      }
      if (response.status >= 400 && response.status < 500) {
        // Typically 404 implies full allow
        return new RobotsParser('');
      }
      throw new Error(`HTTP fetch failed with status ${response.status}`);
    }

    const content = await response.text();
    return new RobotsParser(content);
  } catch (error) {
    console.error(`[fetchRobotsTxt] Error fetching robots for ${domainUrl}:`, error.message);
    // On network/timeout errors, default to allowing all to prevent blocking audits due to temporary issues
    return new RobotsParser('');
  }
}
