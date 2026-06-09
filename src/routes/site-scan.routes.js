import { Router } from 'express';

import { runSiteScan } from '../services/site-scan.service.js';

const router = Router();

router.post('/site-scan', async (req, res) => {
  const {
    url,
    targetUrl,
    target_url: targetUrlSnake,
    maxPages = 50,
    max_pages: maxPagesSnake,
    concurrency = 3,
    includeHtmlSnapshot = false,
    include_html_snapshot: includeHtmlSnapshotSnake = false,
    includeSitemap = true,
    include_sitemap: includeSitemapSnake,
    includeLinkGraph = true,
    include_link_graph: includeLinkGraphSnake,
    timeoutMs = 20000,
    timeout_ms: timeoutMsSnake
  } = req.body || {};

  try {
    const result = await runSiteScan({
      url: targetUrl || targetUrlSnake || url,
      maxPages: clampInteger(maxPagesSnake ?? maxPages, 1, 500, 50),
      concurrency: clampInteger(concurrency, 1, 10, 3),
      includeHtmlSnapshot: Boolean(includeHtmlSnapshot || includeHtmlSnapshotSnake),
      includeSitemap: includeSitemapSnake === undefined ? Boolean(includeSitemap) : Boolean(includeSitemapSnake),
      includeLinkGraph: includeLinkGraphSnake === undefined ? Boolean(includeLinkGraph) : Boolean(includeLinkGraphSnake),
      timeoutMs: clampInteger(timeoutMsSnake ?? timeoutMs, 5000, 120000, 20000)
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Site scan failed.',
      message: error.message
    });
  }
});

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export default router;
