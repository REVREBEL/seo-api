import { Router } from 'express';
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

const router = Router();

// Strict allowlist matching the OpenAPI spec enum for the viewport field.
// Custom objects are intentionally excluded at the API surface to prevent
// authenticated callers from forcing Playwright to allocate arbitrarily large pages.
const ALLOWED_VIEWPORTS = new Set(['desktop', 'tablet', 'mobile']);

router.post('/audit', async (req, res) => {
  const { url, renderMode = 'static', includePerformance = false, includeAccessibility = false, viewport = 'desktop' } = req.body;

  if (!url || !validateUrlSecure(url)) {
    return res.status(400).json({ success: false, error: 'Bad Request: Invalid or forbidden destination URL configuration.' });
  }

  if (!ALLOWED_VIEWPORTS.has(viewport)) {
    return res.status(400).json({
      success: false,
      error: `Bad Request: viewport must be one of: ${[...ALLOWED_VIEWPORTS].join(', ')}.`
    });
  }

  let targetHtml = null;
  let finalFetchedUrl = url;
  let fetchStatus = 200;
  let contentType = 'text/html';
  let axeReport = null;

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
        // Log error and return 502 Bad Gateway
        console.error('Browser rendering failed', { url, error: browserError.message });
        return res.status(502).json({ success: false, error: 'Upstream browser rendering failed: ' + browserError.message });
      }
    } else {
      const staticFetch = await fetchHtml(url);
      if (!staticFetch.success) {
        // Log detailed upstream error server-side
        // eslint-disable-next-line no-console
        console.error('Static HTML fetch failed', {
          url,
          error: staticFetch.error,
        });

        // Return a generic error response to the client
        return res
          .status(502)
          .json({
            success: false,
            error: 'Upstream resource network fetch failed',
            code: 'UPSTREAM_FETCH_FAILED',
          });
      }
      targetHtml = staticFetch.html;
      fetchStatus = staticFetch.status;
      contentType = staticFetch.contentType;
      finalFetchedUrl = staticFetch.url;
    }

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

    return res.json({
      success: true,
      targetUrl: url,
      fetchedAt: new Date().toISOString(),
      renderMode,
      rawFetch: { status: fetchStatus, contentType, finalUrl: finalFetchedUrl },
      structuredData,
      technologies,
      technicalSeo,
      hotelCommercial,
      performance: performanceReport,
      accessibility: axeReport,
      scorecard
    });
});

export default router;