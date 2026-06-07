import { Router } from 'express';
import { parseCloudflareUrlScan } from '../url-scanner/cloudflare-scan-parser.js';
import { submitCloudflareUrlScan, getCloudflareUrlScanResult } from '../url-scanner/cloudflare-urlscanner-client.js';
import {
    createUrlScanFromParsedScan,
    createCloudflareScanSubmissionStart,
    markCloudflareScanSubmitted,
    completeCloudflareScanFromResult,
    failCloudflareScan,
    getUrlScanById,
    listUrlScans
} from '../repositories/url-scan.repository.js';

const router = Router();

// 1. POST /api/url-scan/import
router.post('/url-scan/import', async (req, res, next) => {
    try {
        let body = req.body;
        let rawScan = body;

        if (body?.sourceProvider === 'cloudflare' && body?.scan) {
            rawScan = body.scan;
        }

        if (!rawScan || (!rawScan.task && !rawScan.data)) {
            return res.status(400).json({ success: false, error: 'Invalid or missing Cloudflare scan signature structure.' });
        }

        const parsed = parseCloudflareUrlScan(rawScan);
        const scanId = await createUrlScanFromParsedScan(parsed);

        return res.status(201).json({ success: true, scanId });
    } catch (error) {
        next(error);
    }
});

// 2. POST /api/url-scan
router.post('/url-scan', async (req, res, next) => {
    try {
        const { url: targetUrl, provider = 'cloudflare', waitForResult = false } = req.body;

        if (!targetUrl) {
            return res.status(400).json({ success: false, error: 'Target destination parameter URL is required.' });
        }
        if (provider !== 'cloudflare') {
            return res.status(400).json({ success: false, error: 'Specified execution edge provider not supported in this stack context.' });
        }

        // Step 1: Create local index point state container
        const scanId = await createCloudflareScanSubmissionStart(targetUrl, { waitForResult });

        try {
            // Step 2: Push remote pipeline activation token out
            const submissionResponse = await submitCloudflareUrlScan(targetUrl);
            await markCloudflareScanSubmitted(scanId, submissionResponse);

            const providerScanId = submissionResponse?.uuid || submissionResponse?.result?.uuid;

            // Handle Immediate Asynchronous Polling requests if requested
            if (waitForResult === true) {
                const pollInterval = parseInt(process.env.CLOUDFLARE_URLSCANNER_POLL_INTERVAL_MS) || 3000;
                const pollTimeout = parseInt(process.env.CLOUDFLARE_URLSCANNER_POLL_TIMEOUT_MS) || 60000;
                const startTime = Date.now();

                let completedResult = null;
                while (Date.now() - startTime < pollTimeout) {
                    await new Promise(resolve => setTimeout(resolve, pollInterval));
                    try {
                        const resultData = await getCloudflareUrlScanResult(providerScanId);
                        // Cloudflare API verification tracking checks
                        if (resultData && resultData.data && resultData.task) {
                            completedResult = resultData;
                            break;
                        }
                    } catch (e) {
                        // Wait for processing core state loops gracefully
                    }
                }

                if (completedResult) {
                    const parsed = parseCloudflareUrlScan(completedResult);
                    await completeCloudflareScanFromResult(scanId, parsed);
                    const completePayload = await getUrlScanById(scanId, { includeRaw: false });
                    return res.status(200).json(completePayload);
                }
            }

            return res.status(202).json({
                success: true,
                scanId,
                sourceScanId: providerScanId,
                message: 'Scan dispatch token execution pipeline registered successfully.'
            });

        } catch (edgeError) {
            await failCloudflareScan(scanId, edgeError);
            return res.status(502).json({
                success: false,
                scanId,
                error: 'Upstream scanner provider registration processing failure exception.',
                details: edgeError.details || edgeError.message
            });
        }
    } catch (error) {
        next(error);
    }
});

// 3. GET /api/url-scan/:scanId
router.get('/url-scan/:scanId', async (req, res, next) => {
    try {
        const { scanId } = req.params;
        const includeRaw = req.query.includeRaw === 'true';
        const includeRequests = req.query.includeRequests === 'true';

        const result = await getUrlScanById(scanId, { includeRaw, includeRequests });
        if (!result) {
            return res.status(404).json({ success: false, error: 'Target query locator reference artifact data mapping empty.' });
        }

        return res.status(200).json(result);
    } catch (error) {
        next(error);
    }
});

// 4. GET /api/url-scans
router.get('/url-scans', async (req, res, next) => {
    try {
        const { domain, apexDomain, sourceProvider, limit, offset } = req.query;
        const scans = await listUrlScans({ domain, apexDomain, sourceProvider, limit, offset });
        return res.status(200).json({ success: true, scans });
    } catch (error) {
        next(error);
    }
});

// 5. POST /api/url-scan/:scanId/refresh
router.post('/url-scan/:scanId/refresh', async (req, res, next) => {
    try {
        const { scanId } = req.params;
        const scanRecord = await getUrlScanById(scanId, { includeRaw: true });

        if (!scanRecord) {
            return res.status(404).json({ success: false, error: 'Target historical entry index mapping tracking matrix missing.' });
        }
        if (scanRecord.scan.sourceProvider !== 'cloudflare' || !scanRecord.scan.sourceScanId) {
            return res.status(400).json({ success: false, error: 'Target scan record missing valid upstream tracking configurations.' });
        }

        try {
            const freshResult = await getCloudflareUrlScanResult(scanRecord.scan.sourceScanId);
            const parsed = parseCloudflareUrlScan(freshResult);
            await completeCloudflareScanFromResult(scanId, parsed);

            const refreshedData = await getUrlScanById(scanId, { includeRaw: false });
            return res.status(200).json(refreshedData);
        } catch (refreshErr) {
            return res.status(502).json({
                success: false,
                error: 'Upstream edge reconciliation data download syncing operation rejected.',
                details: refreshErr.details || refreshErr.message
            });
        }
    } catch (error) {
        next(error);
    }
});

export default router;
