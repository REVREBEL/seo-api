import { Router } from 'express';

import { parseSitemap } from '../services/sitemap.service.js';
import { fetchRobotsTxt } from '../services/robots.service.js';
import { validateUrlSecure } from '../utils/security.js';

const router = Router();

router.post('/sitemap', async (req, res) => {
  const {
    url,
    sitemapUrl,
    includeRobots = true,
    followIndexes = true,
    maxSitemaps = 50,
    maxUrls = 50000,
    timeoutMs = 30000
  } = req.body || {};

  const targetUrl = sitemapUrl || url;

  if (!targetUrl || !validateUrlSecure(targetUrl)) {
    return res.status(400).json({
      success: false,
      error: 'Bad Request: valid url or sitemapUrl is required.'
    });
  }

  try {
    const inventory = await collectFullSitemap({
      url: targetUrl,
      includeRobots,
      followIndexes,
      maxSitemaps: clampInteger(maxSitemaps, 1, 250, 50),
      maxUrls: clampInteger(maxUrls, 1, 250000, 50000),
      timeoutMs: clampInteger(timeoutMs, 1000, 120000, 30000)
    });

    return res.status(200).json({ success: true, ...inventory });
  } catch (error) {
    return res.status(502).json({
      success: false,
      error: 'Sitemap collection failed.',
      message: error.message
    });
  }
});

router.get('/sitemap', async (req, res) => {
  const url = req.query.sitemapUrl || req.query.url;
  const includeRobots = req.query.includeRobots !== 'false';
  const followIndexes = req.query.followIndexes !== 'false';
  const maxSitemaps = req.query.maxSitemaps;
  const maxUrls = req.query.maxUrls;

  if (!url || !validateUrlSecure(url)) {
    return res.status(400).json({
      success: false,
      error: 'Bad Request: valid url or sitemapUrl query parameter is required.'
    });
  }

  try {
    const inventory = await collectFullSitemap({
      url,
      includeRobots,
      followIndexes,
      maxSitemaps: clampInteger(maxSitemaps, 1, 250, 50),
      maxUrls: clampInteger(maxUrls, 1, 250000, 50000)
    });

    return res.status(200).json({ success: true, ...inventory });
  } catch (error) {
    return res.status(502).json({
      success: false,
      error: 'Sitemap collection failed.',
      message: error.message
    });
  }
});

async function collectFullSitemap({
  url,
  includeRobots,
  followIndexes,
  maxSitemaps,
  maxUrls,
  timeoutMs = 30000
}) {
  const startedAt = new Date().toISOString();
  const root = new URL(url);
  const seedSitemaps = new Set();
  const visitedSitemaps = new Set();
  const skippedSitemaps = [];
  const errors = [];
  const urlMap = new Map();

  if (looksLikeFeedUrl(root.href)) {
    seedSitemaps.add(root.href);
  } else {
    seedSitemaps.add(`${root.protocol}//${root.host}/sitemap.xml`);
  }

  let robotsSitemaps = [];
  if (includeRobots) {
    const robots = await fetchRobotsTxt(root.href);
    robotsSitemaps = robots.getSitemaps();
    for (const discovered of robotsSitemaps) {
      if (validateUrlSecure(discovered)) seedSitemaps.add(discovered);
    }
  }

  const queue = [...seedSitemaps];

  while (queue.length > 0 && visitedSitemaps.size < maxSitemaps && urlMap.size < maxUrls) {
    const currentSitemap = queue.shift();
    if (!currentSitemap || visitedSitemaps.has(currentSitemap)) continue;

    if (!validateUrlSecure(currentSitemap)) {
      skippedSitemaps.push({ sitemapUrl: currentSitemap, reason: 'unsafe-or-invalid-url' });
      continue;
    }

    visitedSitemaps.add(currentSitemap);

    try {
      await parseSitemap(currentSitemap, (item) => {
        const normalizedLoc = decodeXmlEntity(item.loc || '');
        if (!normalizedLoc || !validateUrlSecure(normalizedLoc)) return;

        if (item.type === 'sitemap') {
          if (followIndexes && !visitedSitemaps.has(normalizedLoc) && queue.length + visitedSitemaps.size < maxSitemaps) {
            queue.push(normalizedLoc);
          }
          return;
        }

        if (urlMap.size >= maxUrls) return;

        if (!urlMap.has(normalizedLoc)) {
          urlMap.set(normalizedLoc, {
            url: normalizedLoc,
            lastmod: item.lastmod ? decodeXmlEntity(item.lastmod) : null,
            changefreq: item.changefreq ? decodeXmlEntity(item.changefreq) : null,
            priority: item.priority ? Number(item.priority) : null,
            sourceType: item.sourceType || 'sitemap',
            sourceSitemap: currentSitemap
          });
        }
      }, { timeout: timeoutMs });
    } catch (error) {
      errors.push({ sitemapUrl: currentSitemap, message: error.message });
    }
  }

  const urls = [...urlMap.values()];
  const byHost = {};
  const byPathPrefix = {};

  for (const item of urls) {
    try {
      const parsed = new URL(item.url);
      byHost[parsed.hostname] = (byHost[parsed.hostname] || 0) + 1;
      const prefix = parsed.pathname.split('/').filter(Boolean)[0] || '/';
      byPathPrefix[prefix] = (byPathPrefix[prefix] || 0) + 1;
    } catch {
      // URL already passed validation, but keep this defensive.
    }
  }

  return {
    target: {
      inputUrl: url,
      origin: `${root.protocol}//${root.host}`
    },
    collection: {
      collectorVersion: 'revrebel-seo-api/sitemap-collector-1.1.0',
      startedAt,
      completedAt: new Date().toISOString(),
      includeRobots,
      followIndexes,
      maxSitemaps,
      maxUrls,
      limitHit: {
        sitemaps: visitedSitemaps.size >= maxSitemaps && queue.length > 0,
        urls: urlMap.size >= maxUrls
      }
    },
    sitemapSources: {
      seedSitemaps: [...seedSitemaps],
      robotsSitemaps,
      fetchedSitemaps: [...visitedSitemaps],
      skippedSitemaps,
      errors
    },
    summary: {
      urlCount: urls.length,
      sitemapCount: visitedSitemaps.size,
      hostCount: Object.keys(byHost).length,
      byHost,
      byPathPrefix
    },
    urls
  };
}

function looksLikeFeedUrl(value) {
  try {
    const parsed = new URL(value);
    return /sitemap|\.xml(\.gz)?$|llms\.txt$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

function decodeXmlEntity(value) {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export default router;
