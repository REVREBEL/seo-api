import { Router } from 'express';
import { validateUrlSecure } from '../utils/security.js';
import { fetchHtml } from '../services/fetch-html.service.js';
import { renderHtml, closeBrowser } from '../services/render-html.service.js';
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
import { chromium } from 'playwright';

const router = Router();

router.post('/audit', async (req, res) => {
  const { url, renderMode = 'static', includePerformance = false, includeAccessibility = false } = req.body;

  // 1. Strict Firewall Layer
  if (!url || !validateUrlSecure(url)) {
    return res.status(400).json({ success: false, error: 'Bad Request: Invalid or non-permitted destination URL structure.' });
  }

  try {
    let targetHtml = null;
    let finalFetchedUrl = url;
    let fetchStatus = null;
    let contentType = '';
    let axeReport = null;

    const robotsParser = await fetchRobotsTxt(url);

    // 2. Conditional Processing Engine
    if (renderMode === 'browser' || includeAccessibility) {
      const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
      const context = await browser.newContext({ ignoreHTTPSErrors: true });
      const page = await context.newPage();
      
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      targetHtml = await page.content();
      finalFetchedUrl = page.url();
      fetchStatus = 200;
      contentType = 'text/html; executed-dom';

      if (includeAccessibility) {
        const rawA11y = await runAccessibilityAudit(page);
        axeReport = analyzeAccessibility(rawA11y);
      }
      await context.close();
      await browser.close();
    } else {
      const staticFetch = await fetchHtml(url);
      targetHtml = staticFetch.html;
      fetchStatus = staticFetch.status;
      contentType = staticFetch.contentType;
      finalFetchedUrl = staticFetch.url;
    }

    // 3. Extraction & Optimization Services
    const structuredData = extractStructuredData(targetHtml);
    const technologies = detectTechnologies(targetHtml, {});

    // 4. Analysis Layer Execution
    const technicalSeo = analyzeTechnicalSeo(targetHtml, finalFetchedUrl, robotsParser);
    const hotelCommercial = analyzeHotelCommercial(structuredData, technologies);
    
    let performanceReport = null;
    if (includePerformance) {
      const rawLighthouse = await runLighthouseAudit(url);
      performanceReport = analyzePerformance(rawLighthouse.performance);
    }

    // 5. Scorecard Computation
    const scorecard = generateScorecard(technicalSeo, hotelCommercial, performanceReport, axeReport);

    // 6. Return standard structured target output schema
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

  } catch (error) {
    console.error(`[Orchestration Failure]:`, error.message);
    return res.status(500).json({ success: false, error: 'Internal system audit orchestration collapse.' });
  }
});

export default router;