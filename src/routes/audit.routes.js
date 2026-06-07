import { Router } from 'express';
import * as cheerio from 'cheerio';

import {
  createAuditRunStart,
  completeAuditRun,
  failAuditRun,
  getAuditRunById,
  listAuditRuns,
} from "../repositories/audit-run.repository.js";
import { getUrlParts } from '../utils/url-normalization.js';
import { validateUrlSecure } from '../utils/security.js';
import { fetchHtml } from '../services/fetch-html.service.js';
import { executeBrowserWorkflow } from '../services/render-html.service.js';
import { fetchRobotsTxt } from '../services/robots.service.js';
import { extractStructuredData } from '../services/structured-data.service.js';
import { detectTechnologies } from '../services/technology-detection.service.js';
import {
  extractBrowserSignals,
  extractNetworkSignals,
  runLighthouseAudit
} from '../services/lighthouse.service.js';
import { runAccessibilityAudit } from '../services/accessibility.service.js';

import { getAllowedViewports } from '../utils/openapi.utils.js';

const router = Router();

function mapAuditRun(row) {
  if (!row) return null;

  return {
    auditId: row.id,
    targetUrl: row.target_url,
    normalizedUrl: row.normalized_url,
    domain: row.domain,
    path: row.path,
    renderMode: row.render_mode,
    viewport: row.viewport,
    status: row.status,
    httpStatus: row.http_status,
    responseTimeMs: row.response_time_ms,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    request: row.requested_options,
    result: row.result_json,
    error: row.error_json,
    scores: {
      overall: row.overall_score,
      technical: row.technical_score,
      hotelCommercial: row.hotel_commercial_score,
      performance: row.performance_score,
      accessibility: row.accessibility_score,
    },
  };
}

router.post('/audit', async (req, res) => {
  const { url, renderMode = 'static', includePerformance = false, includeAccessibility = false, viewport = 'desktop' } = req.body;

  if (!url || !validateUrlSecure(url)) {
    return res.status(400).json({ success: false, error: 'Bad Request: Invalid or forbidden destination URL configuration.' });
  }

  const ALLOWED_VIEWPORTS = getAllowedViewports();
  if (!ALLOWED_VIEWPORTS.has(viewport)) {
    return res.status(400).json({
      success: false,
      error: `Bad Request: viewport must be one of: ${[...ALLOWED_VIEWPORTS].join(', ')}.`
    });
  }

  const { normalizedUrl, domain, path } = getUrlParts(url);

  let auditRun;
  try {
    auditRun = await createAuditRunStart({
      targetUrl: url,
      normalizedUrl,
      domain,
      path,
      renderMode,
      viewport,
      requestedOptions: req.body,
    });
  } catch (dbError) {
    console.error('Failed to create audit run', { error: dbError });
    return res.status(500).json({ success: false, error: 'Database persistence is unavailable' });
  }

  const { id: auditId } = auditRun;

  try {
    let targetHtml = null;
    let finalFetchedUrl = url;
    let fetchStatus = 200;
    let contentType = 'text/html';
    let accessibilityEvidence = null;
    const startTime = Date.now();

    const robotsParser = await fetchRobotsTxt(url);

    if (renderMode === 'browser' || includeAccessibility) {
      try {
        const browserRuntimeSnapshot = await executeBrowserWorkflow(url, {
          viewport,
          waitUntil: 'domcontentloaded',
          timeout: 45000,
          settleTimeMs: 2000
        }, async (livePageInstance) => {
          if (includeAccessibility) {
            return await runAccessibilityAudit(livePageInstance);
          }
          return null;
        });

        targetHtml = browserRuntimeSnapshot.html;
        finalFetchedUrl = browserRuntimeSnapshot.finalUrl;
        accessibilityEvidence = browserRuntimeSnapshot.callbackData;
        fetchStatus = browserRuntimeSnapshot.status || fetchStatus;
        contentType = 'text/html; executed-dom';
      } catch (browserError) {
        console.error('Browser rendering failed', { url, error: browserError.stack || browserError.message || String(browserError) });
        await failAuditRun(auditId, { errorJson: { message: 'Browser rendering failed', details: browserError.message } });
        return res.status(502).json({ success: false, auditId, status: 'failed', error: 'Upstream browser rendering failed: ' + browserError.message });
      }
    } else {
      const staticFetch = await fetchHtml(url);
      if (!staticFetch.success) {
        console.error('Static HTML fetch failed', {
          url,
          error: staticFetch.error,
        });
        await failAuditRun(auditId, { errorJson: { message: 'Static HTML fetch failed', details: staticFetch.error } });
        return res
          .status(502)
          .json({
            success: false,
            auditId,
            status: 'failed',
            error: 'Upstream resource network fetch failed',
            code: 'UPSTREAM_FETCH_FAILED',
          });
      }
      targetHtml = staticFetch.html;
      fetchStatus = staticFetch.status;
      contentType = staticFetch.contentType;
      finalFetchedUrl = staticFetch.url;
    }

    const responseTimeMs = Date.now() - startTime;
    const htmlSignals = buildHtmlSignals(targetHtml, finalFetchedUrl, robotsParser);
    const structuredData = extractStructuredData(targetHtml);
    const technologySignals = detectTechnologies(targetHtml, {});

    let lighthouseRun = null;
    let browserSignals = null;
    let networkSignals = null;

    if (includePerformance) {
      lighthouseRun = await runLighthouseAudit(url);
      browserSignals = extractBrowserSignals(lighthouseRun.normalized);
      networkSignals = extractNetworkSignals(lighthouseRun.normalized);
    }

    const commercialSignals = buildCommercialSignals({ structuredData, technologySignals, htmlSignals });

    const result = {
      target: {
        inputUrl: url,
        normalizedUrl,
        finalUrl: finalFetchedUrl,
        domain,
        path,
        statusCode: fetchStatus,
        contentType
      },
      collection: {
        collectorVersion: 'revrebel-seo-api/0.2.0',
        collectedAt: new Date().toISOString(),
        renderMode,
        viewport,
        responseTimeMs,
        modesRun: [
          renderMode === 'browser' ? 'browser-dom' : 'static-html',
          includePerformance ? 'lighthouse-navigation' : null,
          includeAccessibility ? 'axe-accessibility' : null
        ].filter(Boolean),
        lighthouseVersion: lighthouseRun?.normalized?.meta?.lighthouseVersion ?? null
      },
      evidenceSummary: buildEvidenceSummary({ htmlSignals, structuredData, lighthouseRun, accessibilityEvidence }),
      lighthouse: {
        navigation: lighthouseRun?.normalized ?? null
      },
      htmlSignals,
      structuredData,
      commercialSignals,
      technologySignals,
      networkSignals,
      browserSignals,
      accessibilityEvidence,
      rawArtifacts: {
        lighthouseNavigationJson: lighthouseRun?.raw ?? null,
        htmlSnapshot: targetHtml,
        rawFetch: { status: fetchStatus, contentType, finalUrl: finalFetchedUrl }
      }
    };

    const scores = extractEvidenceScores(lighthouseRun);

    await completeAuditRun(auditId, {
      httpStatus: fetchStatus,
      responseTimeMs,
      resultJson: result,
      ...scores,
    });

    return res.json({
      success: true,
      auditId,
      status: 'completed',
      targetUrl: url,
      result,
    });
  } catch (error) {
    console.error(`Audit failed for ${url}`, { auditId, error: error.stack });
    await failAuditRun(auditId, { errorJson: { message: 'Internal server error during audit', details: error.message } });
    return res.status(500).json({ success: false, auditId, status: 'failed', error: 'Internal Server Error' });
  }
});

router.get('/audit/:auditId', async (req, res) => {
  const { auditId } = req.params;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(auditId)) {
    return res.status(400).json({ success: false, error: 'Invalid auditId format. Must be a valid UUID.' });
  }
  try {
    const auditRun = await getAuditRunById(auditId);
    if (!auditRun) {
      return res.status(404).json({ success: false, error: 'Audit run not found' });
    }
    return res.json({ success: true, audit: mapAuditRun(auditRun) });
  } catch (dbError) {
    console.error('Failed to retrieve audit run', { error: dbError });
    return res.status(500).json({ success: false, error: 'Database error' });
  }
});

router.get('/audits', async (req, res) => {
  const { domain, limit = 10, offset = 0 } = req.query;
  try {
    const auditRuns = await listAuditRuns({ domain, limit, offset });
    return res.json({
      success: true,
      domain,
      count: auditRuns.length,
      audits: auditRuns.map(mapAuditRun),
    });
  } catch (dbError) {
    console.error('Failed to list audit runs', { error: dbError });
    return res.status(500).json({ success: false, error: 'Database error' });
  }
});

function buildHtmlSignals(htmlString, finalUrl, robotsParser) {
  const $ = cheerio.load(htmlString || '');
  const canonical = $('link[rel="canonical"]').attr('href')?.trim() || null;
  const metaRobots = $('meta[name="robots"]').attr('content')?.trim() || null;
  const images = [];
  const links = [];

  $('img').each((_, el) => {
    images.push({
      src: $(el).attr('src') || null,
      alt: $(el).attr('alt') ?? null,
      width: $(el).attr('width') || null,
      height: $(el).attr('height') || null,
      loading: $(el).attr('loading') || null
    });
  });

  $('a').each((_, el) => {
    links.push({
      href: $(el).attr('href') || null,
      text: $(el).text().replace(/\s+/g, ' ').trim()
    });
  });

  return {
    title: $('title').text().trim() || null,
    description: $('meta[name="description"]').attr('content')?.trim() || null,
    canonical,
    canonicalComparison: compareCanonical(canonical, finalUrl),
    h1: $('h1').map((_, el) => $(el).text().replace(/\s+/g, ' ').trim()).get(),
    h2: $('h2').map((_, el) => $(el).text().replace(/\s+/g, ' ').trim()).get(),
    h1Count: $('h1').length,
    h2Count: $('h2').length,
    htmlLang: $('html').attr('lang') || null,
    viewport: $('meta[name="viewport"]').attr('content') || null,
    metaRobots,
    isNoindexPresent: (metaRobots || '').toLowerCase().includes('noindex'),
    isRobotsAllowed: robotsParser && finalUrl ? robotsParser.isAllowed(finalUrl, 'REVREBEL-Bot') : null,
    imageCount: images.length,
    missingImgAltCount: images.filter((image) => image.alt === null || image.alt === '').length,
    images,
    linkCount: links.length,
    links
  };
}

function buildCommercialSignals({ structuredData, technologySignals, htmlSignals }) {
  return {
    schemaTypesFound: structuredData?.schemaTypesFound || [],
    jsonLdBlockCount: structuredData?.jsonLdBlockCount || 0,
    microdataBlockCount: structuredData?.microdataBlockCount || 0,
    bookingEngineEvidence: technologySignals || [],
    socialMetadata: {
      openGraph: structuredData?.openGraph || {},
      twitter: structuredData?.twitter || {}
    },
    contactSignals: {
      phoneLinks: (htmlSignals?.links || []).filter((link) => String(link.href || '').startsWith('tel:')),
      emailLinks: (htmlSignals?.links || []).filter((link) => String(link.href || '').startsWith('mailto:'))
    }
  };
}

function buildEvidenceSummary({ htmlSignals, structuredData, lighthouseRun, accessibilityEvidence }) {
  const lighthouseSummary = lighthouseRun?.normalized?.summary || {};

  return {
    lighthouse: {
      navigationAuditCount: lighthouseSummary.auditCount || 0,
      failedAuditIds: lighthouseSummary.failedAuditIds || [],
      warningAuditIds: lighthouseSummary.warningAuditIds || [],
      passedAuditIds: lighthouseSummary.passedAuditIds || [],
      manualAuditIds: lighthouseSummary.manualAuditIds || [],
      notApplicableAuditIds: lighthouseSummary.notApplicableAuditIds || [],
      informativeAuditIds: lighthouseSummary.informativeAuditIds || []
    },
    html: {
      title: htmlSignals.title,
      metaDescription: htmlSignals.description,
      canonical: htmlSignals.canonical,
      h1Count: htmlSignals.h1Count,
      h2Count: htmlSignals.h2Count,
      imageCount: htmlSignals.imageCount,
      missingImgAltCount: htmlSignals.missingImgAltCount,
      linkCount: htmlSignals.linkCount
    },
    structuredData: {
      jsonLdBlockCount: structuredData?.jsonLdBlockCount || 0,
      microdataBlockCount: structuredData?.microdataBlockCount || 0,
      schemaTypesFound: structuredData?.schemaTypesFound || []
    },
    accessibility: {
      violationCount: Array.isArray(accessibilityEvidence) ? accessibilityEvidence.length : null,
      violationIds: Array.isArray(accessibilityEvidence) ? accessibilityEvidence.map((item) => item.id) : []
    }
  };
}

function extractEvidenceScores(lighthouseRun) {
  const categories = lighthouseRun?.normalized?.categories || {};
  return {
    overallScore: null,
    technicalScore: null,
    hotelCommercialScore: null,
    performanceScore: categories.performance?.score ?? null,
    accessibilityScore: categories.accessibility?.score ?? null
  };
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

export default router;
