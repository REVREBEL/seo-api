import axios from 'axios';

export async function submitCloudflareUrlScan(targetUrl) {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const token = process.env.CLOUDFLARE_URLSCANNER_API_TOKEN;
    const baseUrl = process.env.CLOUDFLARE_URLSCANNER_BASE_URL || 'https://api.cloudflare.com/client/v4';

    let scanPath = process.env.CLOUDFLARE_URLSCANNER_SCAN_PATH || '/accounts/{accountId}/urlscanner/v2/scan';
    scanPath = scanPath.replace('{accountId}', accountId);

    if (!accountId || !token) {
        throw new Error('Cloudflare operation failed: Missing structural account configuration credentials.');
    }

    try {
        const response = await axios.post(`${baseUrl}${scanPath}`, { url: targetUrl }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        return response.data;
    } catch (error) {
        throw {
            message: 'Cloudflare edge scanner submission rejected.',
            status: error.response?.status || 500,
            details: error.response?.data || error.message
        };
    }
}

export async function getCloudflareUrlScanResult(providerScanId) {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const token = process.env.CLOUDFLARE_URLSCANNER_API_TOKEN;
    const baseUrl = process.env.CLOUDFLARE_URLSCANNER_BASE_URL || 'https://api.cloudflare.com/client/v4';

    let resultPath = process.env.CLOUDFLARE_URLSCANNER_RESULT_PATH || '/accounts/{accountId}/urlscanner/v2/result/{scanId}';
    resultPath = resultPath.replace('{accountId}', accountId).replace('{scanId}', providerScanId);

    try {
        const response = await axios.get(`${baseUrl}${resultPath}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        return response.data;
    } catch (error) {
        throw {
            message: 'Failed to retrieve Cloudflare scan execution payload.',
            status: error.response?.status || 500,
            details: error.response?.data || error.message
        };
    }
}