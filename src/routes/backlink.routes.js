import { Router } from 'express';

import { verifyBacklinks } from '../services/backlink-verification.service.js';

const router = Router();

router.post('/backlinks/verify', async (req, res) => {
  const { targetUrl, target_url: targetUrlSnake, links = [], headOnly = false, head_only: headOnlySnake = false, timeout = 30000 } = req.body || {};

  try {
    const result = await verifyBacklinks({
      targetUrl: targetUrl || targetUrlSnake,
      links,
      headOnly: Boolean(headOnly || headOnlySnake),
      timeout: clampInteger(timeout, 1000, 120000, 30000)
    });

    if (result.status === 'error') {
      return res.status(400).json({ success: false, ...result });
    }

    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return res.status(502).json({
      success: false,
      status: 'error',
      error: 'Backlink verification failed.',
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
