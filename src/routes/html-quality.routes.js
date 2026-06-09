import { Router } from 'express';

import { fetchHtml } from '../services/fetch-html.service.js';
import { analyzeHtmlQuality } from '../services/html-quality.service.js';
import { validateUrlSecure } from '../utils/security.js';

const router = Router();

router.post('/html-quality', async (req, res) => {
  const { html, url, source } = req.body || {};

  try {
    if (html) {
      const result = analyzeHtmlQuality({ html, source: source || 'inline-html' });
      return res.status(result.success ? 200 : 400).json(result);
    }

    if (!url || !validateUrlSecure(url)) {
      return res.status(400).json({
        success: false,
        error: {
          type: 'invalid_input',
          message: 'Valid html or url is required.',
          retryable: false,
          suggestion: 'POST { "html": "..." } or { "url": "https://example.com" }.'
        }
      });
    }

    const fetched = await fetchHtml(url);
    if (!fetched.success) {
      return res.status(502).json({
        success: false,
        error: {
          type: 'fetch_failed',
          message: fetched.error || 'Could not fetch URL.',
          retryable: true,
          suggestion: 'Confirm the URL is reachable and returns HTML.'
        }
      });
    }

    const result = analyzeHtmlQuality({ html: fetched.html, source: fetched.url || url });
    return res.status(200).json({
      ...result,
      fetch: {
        requestedUrl: fetched.requestedUrl,
        finalUrl: fetched.url,
        status: fetched.status,
        contentType: fetched.contentType,
        xRobotsTag: fetched.xRobotsTag,
        redirected: fetched.redirected,
        redirectChain: fetched.redirectChain
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: {
        type: 'internal_error',
        message: error.message,
        retryable: false,
        suggestion: 'Check server logs for details.'
      }
    });
  }
});

export default router;
