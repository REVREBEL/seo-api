import { Router } from 'express';

import {
  createAuditRunStart,
  completeAuditRun,
  failAuditRun,
  getAuditRunById,
  listAuditRuns,
} from "../repositories/audit-run.repository.js";
import { extractScoresForPersistence } from '../utils/score-extraction.js';
import { getUrlParts } from '../utils/url-normalization.js';
import { validateUrlSecure } from '../utils/security.js';
import { fetchHtml } from '../services/fetch-html.service.js';
import { executeBrowserWorkflow } from '../services/render-html.service.js';
import { fetchRobotsTxt } from '../services/robots.service.js';
import { extractStructuredData } from '../services/structured-data.service.js';
import { detectTechnologies } from '../services/technology-detection.service.js';
import { runLighthouseAudit } from '../services/lighthouse.service.js';
import { runAccessibilityAudit } from '../services/accessibility.service.js';
import { analyzeTechnicalSeo } from '../analyzers/technical-seo.analyzer.js';
import { analyzeHotelCommercial } from '../analyzers/hotel-commercial.analyzer.js';
import { analyzePerformance } from '../analyzers/performance.analyzer.js';
import { analyzeAccessibility } from '../analyzers/accessibility.analyzer.js';
import { generateScorecard } from '../scoring/scorecard.engine.js';

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
    let axeReport = null;
    const startTime = Date.now();

    const robotsParser = await fetchRobotsTxt(url);

    // Unified Resource Ingestion Engine
    if (renderMode === 'browser' || includeAccessibility) {
      try {
        const browserRuntimeSnapshot = await executeBrowserWorkflow(url, { viewport }, async (livePageInstance) => {
          if (includeAccessibility) {
            const rawA11yErrors = await runAccessibilityAudit(livePageInstance);
            return analyzeAccessibility(rawA11yErrors);
          }
          return null;
        });

        targetHtml = browserRuntimeSnapshot.html;
        finalFetchedUrl = browserRuntimeSnapshot.finalUrl;
        axeReport = browserRuntimeSnapshot.callbackData;
        fetchStatus = browserRuntimeSnapshot.status || fetchStatus;
        contentType = 'text/html; executed-dom';
      } catch (browserError) {
        // Log rich error object and return 502 Bad Gateway
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
    const structuredData = extractStructuredData(targetHtml);
    const technologies = detectTechnologies(targetHtml, {});

    const technicalSeo = analyzeTechnicalSeo(targetHtml, finalFetchedUrl, robotsParser);
    const hotelCommercial = analyzeHotelCommercial(structuredData, technologies);

    let performanceReport = null;
    if (includePerformance) {
      const rawLighthouse = await runLighthouseAudit(url);
      performanceReport = analyzePerformance(rawLighthouse.performance);
    }

    const scorecard = generateScorecard(technicalSeo, hotelCommercial, performanceReport, axeReport);

    const result = {
      technicalSeo,
      hotelCommercial,
      performance: performanceReport,
      accessibility: axeReport,
      scorecard,
      structuredData,
      technologies,
      rawFetch: { status: fetchStatus, contentType, finalUrl: finalFetchedUrl },
    };

    const scores = extractScoresForPersistence(result);

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


export default router;