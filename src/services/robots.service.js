const AI_BOTS = [
  ['GPTBot', 'OpenAI model training crawler'],
  ['ClaudeBot', 'Anthropic model training crawler'],
  ['Google-Extended', 'Google AI training opt-out token'],
  ['CCBot', 'Common Crawl corpus crawler'],
  ['PerplexityBot', 'Perplexity answer-engine crawler'],
  ['Bytespider', 'ByteDance crawler associated with AI training']
];

export class RobotsParser {
  constructor(robotsTxtContent, meta = {}) {
    this.url = meta.url || null;
    this.fetchedUrl = meta.fetchedUrl || meta.url || null;
    this.status = meta.status || null;
    this.error = meta.error || null;
    this.groups = [];
    this.sitemaps = [];
    this.rawLines = 0;
    this._parse(robotsTxtContent || '');
  }

  _parse(content) {
    let currentGroup = null;
    let expectingAgents = false;

    for (const raw of content.split(/\r?\n/)) {
      this.rawLines += 1;
      const line = raw.split('#')[0].trim();
      if (!line || !line.includes(':')) continue;

      const delimiterIndex = line.indexOf(':');
      const field = line.substring(0, delimiterIndex).trim().toLowerCase();
      const value = line.substring(delimiterIndex + 1).trim();

      if (field === 'user-agent' || field === 'useragent') {
        if (!currentGroup || !expectingAgents) {
          currentGroup = { agents: [], rules: [], crawlDelay: null };
          this.groups.push(currentGroup);
          expectingAgents = true;
        }
        if (value) currentGroup.agents.push(value.toLowerCase());
        continue;
      }

      expectingAgents = false;

      if (field === 'allow' || field === 'disallow') {
        if (!currentGroup) {
          currentGroup = { agents: ['*'], rules: [], crawlDelay: null };
          this.groups.push(currentGroup);
        }
        if (!value) continue;
        currentGroup.rules.push({
          allow: field === 'allow',
          pattern: value,
          regex: ruleToRegex(value)
        });
      } else if (field === 'crawl-delay') {
        if (currentGroup) {
          const parsed = Number.parseFloat(value);
          if (Number.isFinite(parsed)) currentGroup.crawlDelay = parsed;
        }
      } else if (field === 'sitemap' && value) {
        this.sitemaps.push(this.fetchedUrl ? new URL(value, this.fetchedUrl).href : value);
      }
    }
  }

  isAllowed(targetUrl, userAgent = '*') {
    return this.canFetch(userAgent, targetUrl).allowed;
  }

  canFetch(userAgent = '*', targetUrl = '/') {
    try {
      const group = this._selectGroup(userAgent);
      const parsed = new URL(targetUrl, 'http://dummy.local');
      const path = normalizePath(parsed.pathname + parsed.search);

      if (!group || group.rules.length === 0) {
        return {
          allowed: true,
          matchedGroup: group?.agents || null,
          matchedRule: null,
          reason: 'no applicable rule (default allow)'
        };
      }

      let winner = null;
      for (const rule of group.rules) {
        if (!rule.regex.test(path)) continue;
        const matchLength = rule.pattern.endsWith('$') ? rule.pattern.length - 1 : rule.pattern.length;
        if (!winner || matchLength > winner.matchLength || (matchLength === winner.matchLength && rule.allow && !winner.allow)) {
          winner = { ...rule, matchLength };
        }
      }

      if (!winner) {
        return {
          allowed: true,
          matchedGroup: group.agents,
          matchedRule: null,
          reason: 'no matching rule (default allow)'
        };
      }

      return {
        allowed: winner.allow,
        matchedGroup: group.agents,
        matchedRule: `${winner.allow ? 'Allow' : 'Disallow'}: ${winner.pattern}`,
        reason: 'longest-match rule'
      };
    } catch (error) {
      console.warn(`[RobotsParser] Invalid URL format provided to canFetch: ${targetUrl}`);
      return {
        allowed: false,
        matchedGroup: null,
        matchedRule: null,
        reason: 'invalid url format'
      };
    }
  }

  crawlDelayFor(userAgent = '*') {
    return this._selectGroup(userAgent)?.crawlDelay ?? null;
  }

  getSitemaps() {
    return this.sitemaps;
  }

  getSummary({ userAgent = '*', path = '/', checkAiBots = true } = {}) {
    const decision = this.canFetch(userAgent, path);
    const summary = {
      robotsUrl: this.url,
      fetchedUrl: this.fetchedUrl,
      status: this.status,
      error: this.error,
      groups: this.groups.length,
      rulesTotal: this.groups.reduce((sum, group) => sum + group.rules.length, 0),
      sitemaps: this.sitemaps,
      userAgentEvaluated: userAgent,
      pathChecked: path,
      allowed: decision.allowed,
      decision,
      crawlDelay: this.crawlDelayFor(userAgent)
    };

    if (checkAiBots) {
      summary.aiBots = AI_BOTS.map(([bot, ownerNote]) => {
        const botDecision = this.canFetch(bot, path || '/');
        return {
          bot,
          ownerNote,
          path: path || '/',
          allowed: botDecision.allowed,
          matchedRule: botDecision.matchedRule,
          matchedGroup: botDecision.matchedGroup,
          crawlDelay: this.crawlDelayFor(bot)
        };
      });
    }

    return summary;
  }

  _selectGroup(userAgent = '*') {
    const ua = String(userAgent || '').toLowerCase();
    let best = null;
    let bestLength = -1;
    let star = null;

    for (const group of this.groups) {
      for (const token of group.agents) {
        if (token === '*') {
          if (!star) star = group;
          continue;
        }
        if (ua.startsWith(token) || ua.includes(token)) {
          if (token.length > bestLength) {
            bestLength = token.length;
            best = group;
          }
        }
      }
    }

    return best || star;
  }
}

export async function fetchRobotsTxt(domainUrl, options = {}) {
  const { timeout = 10000 } = options;
  let robotsUrl = null;

  try {
    robotsUrl = normalizeRobotsUrl(domainUrl);
    const response = await fetch(robotsUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeout),
      headers: {
        'User-Agent': 'REVREBEL-WebsiteHealthcheck/1.0 (+https://revrebel.io)',
        'Accept': 'text/plain,*/*;q=0.8'
      }
    });

    if (!response.ok) {
      const parser = new RobotsParser(response.status === 401 || response.status === 403 ? 'User-agent: *\nDisallow: /' : '', {
        url: robotsUrl,
        fetchedUrl: response.url || robotsUrl,
        status: response.status,
        error: `HTTP ${response.status}`
      });
      return parser;
    }

    const content = await response.text();
    return new RobotsParser(content, {
      url: robotsUrl,
      fetchedUrl: response.url || robotsUrl,
      status: response.status,
      error: null
    });
  } catch (error) {
    console.error(`[fetchRobotsTxt] Error fetching robots for ${domainUrl}:`, error.message);
    return new RobotsParser('', {
      url: robotsUrl,
      fetchedUrl: robotsUrl,
      status: 0,
      error: error.message
    });
  }
}

function normalizeRobotsUrl(input) {
  const raw = String(input || '').includes('://') ? String(input) : `https://${input}`;
  const parsed = new URL(raw);
  if (parsed.pathname.toLowerCase().endsWith('/robots.txt') || parsed.pathname.toLowerCase() === '/robots.txt') {
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  }
  return `${parsed.protocol}//${parsed.host}/robots.txt`;
}

function normalizePath(path) {
  if (!path) return '/';
  return path.startsWith('/') ? path : `/${path}`;
}

function ruleToRegex(pattern) {
  const endAnchor = pattern.endsWith('$');
  const core = endAnchor ? pattern.slice(0, -1) : pattern;
  let output = '';
  for (const char of core) {
    output += char === '*' ? '.*' : escapeRegex(char);
  }
  return new RegExp(`^${output}${endAnchor ? '$' : ''}`);
}

function escapeRegex(char) {
  return char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
