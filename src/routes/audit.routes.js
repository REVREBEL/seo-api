/**
 * Audit Routes
 * Express router mapping inbound POST requests to the modular audit pipeline.
 */

import { Router } from 'express';
import { fetchHtml } from '../services/fetch-html.service.js';
import { renderHtml } from '../services/render-html.service.js';
import { fetchRobotsTxt } from '../services/robots.service.js';
import { detectTechnologies } from '../services/technology-detection.service.js';
import { extractStructuredData } from '../services/structured-data.service.js';
import { analyzeTechnicalSeo } from '../analyzers/technical-seo.analyzer.js';
import { analyzeHotelCommercial } from '../analyzers/hotel-commercial.analyzer.js';
import { generateScorecard } from '../scoring/scorecard.engine.js';

const router = Router();

/**
 * POST /api/audit
 * Ingests a URL and runs the full clean-room commercial audit suite.
 */
router.post('/audit', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ success: false, error: 'Missing target "url" parameter in request body.' });
  }

  try {
    // 1. Ingestion Tier (Parallel processing where safe)
    const [rawFetch, robotsParser] = await Promise.all([
      fetchHtml(url),
      fetchRobotsTxt(url)
    ]);

    // Render fully executed JavaScript DOM via Playwright
    const renderedDOM = await renderHtml(url);

    // 2. Extraction Tier
    const targetHtml = renderedDOM.success ? renderedDOM.html : rawFetch.html;
    const structuredData = extractStructuredData(targetHtml);
    const technologies = detectTechnologies(targetHtml, {}); 

    // 3. Analysis Tier
    const technicalAnalysis = analyzeTechnicalSeo(rawFetch, renderedDOM, robotsParser);
    const hotelAnalysis = analyzeHotelCommercial(structuredData, technologies);

    // 4. Scoring & Compilation Tier
    const finalScorecard = generateScorecard(technicalAnalysis, hotelAnalysis);

    // Return unified structural footprint optimized for LLM/MCP tool ingestion
    return res.json({
      success: true,
      targetUrl: url,
      audit: finalScorecard
    });

  } catch (error) {
    console.error(`[API Audit Route Error] Core failure processing ${url}:`, error.message);
    return res.status(500).json({ success: false, error: 'Internal server orchestration failure.' });
  }
});

export default router;