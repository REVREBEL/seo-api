import { Router } from 'express';

import { runUnlighthouseSiteAudit } from '../services/unlighthouse.service.js';

const router = Router();

router.post('/site-audit/unlighthouse', async (req, res) => {
  const {
    url,
    targetUrl,
    target_url: targetUrlSnake,
    device = 'mobile',
    maxRoutes = 200,
    max_routes: maxRoutesSnake,
    outputDir,
    output_dir: outputDirSnake,
    timeoutMs = 600000,
    timeout_ms: timeoutMsSnake
  } = req.body || {};

  try {
    const result = await runUnlighthouseSiteAudit({
      targetUrl: targetUrl || targetUrlSnake || url,
      device,
      maxRoutes: clampInteger(maxRoutesSnake ?? maxRoutes, 1, 1000, 200),
      outputDir: outputDir || outputDirSnake || null,
      timeoutMs: clampInteger(timeoutMsSnake ?? timeoutMs, 60000, 1800000, 600000)
    });

    if (!result.ok) {
      return res.status(502).json({ success: false, ...result });
    }

    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return res.status(502).json({
      success: false,
      ok: false,
      error: 'Unlighthouse site audit failed.',
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
