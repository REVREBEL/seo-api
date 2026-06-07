import url from 'url';

export function parseCloudflareUrlScan(scanJson) {
    const indexFields = extractScanIndexFields(scanJson);
    const summary = buildScanSummary(scanJson);
    const normalizedRequests = normalizeScanRequests(scanJson);

    return {
        ...indexFields,
        summary,
        normalizedRequests,
        rawScanJson: scanJson,
    };
}

export function extractScanIndexFields(scanJson) {
    const task = scanJson?.task || {};
    const page = scanJson?.page || {};
    const verdicts = scanJson?.verdicts || {};
    const stats = scanJson?.stats || {};

    const targetUrl = task.url || '';
    let domain = '';
    let apexDomain = '';
    let path = '';

    if (targetUrl) {
        try {
            const parsedUrl = new url.URL(targetUrl);
            domain = parsedUrl.hostname;
            path = parsedUrl.pathname;
            const parts = domain.split('.');
            if (parts.length >= 2) {
                apexDomain = parts.slice(-2).join('.');
            } else {
                apexDomain = domain;
            }
        } catch (e) {
            // Graceful fallback for non-standard URIs
        }
    }

    const requests = scanJson?.data?.requests || [];
    const failedCount = requests.filter(r => (r.response?.status || 0) >= 400).length;

    const blockedCount = requests.filter(r => {
        const status = r.response?.status || 0;
        if ([401, 403, 407].includes(status)) return true;
        if (status >= 400) {
            const serverHeader = getHeaderValue(r.response?.headers, 'server') || '';
            return /cloudfr|s3|cloudflare/i.test(serverHeader);
        }
        return false;
    }).length;

    const thirdPartyRequests = requests.filter(r => {
        if (!r.request?.url) return false;
        try {
            const reqHost = new url.URL(r.request.url).hostname;
            return reqHost !== domain && !reqHost.endsWith('.' + apexDomain);
        } catch {
            return false;
        }
    });

    const uniqueThirdPartyDomains = new Set(thirdPartyRequests.map(r => {
        try { return new url.URL(r.request.url).hostname; } catch { return null; }
    }).filter(Boolean));

    return {
        source_scan_id: task.uuid || null,
        source_provider: 'cloudflare',
        target_url: targetUrl,
        normalized_url: targetUrl,
        final_url: page.url || targetUrl,
        domain: domain || null,
        apex_domain: apexDomain || null,
        path: path || null,
        scan_status: 'completed',
        scan_method: task.method || 'GET',
        scan_source: 'api',
        report_url: task.reportURL || null,
        screenshot_url: task.screenshotURL || null,
        dom_url: task.domURL || null,
        http_status: page.status || null,
        page_title: page.title || null,
        mime_type: page.mimeType || null,
        server_name: page.server || null,
        total_requests: requests.length,
        failed_request_count: failedCount,
        blocked_request_count: blockedCount,
        third_party_domain_count: uniqueThirdPartyDomains.size,
        third_party_request_count: thirdPartyRequests.length,
        total_size_bytes: stats.resourceStats?.reduce((acc, curr) => acc + (curr.size || 0), 0) || 0,
        encoded_size_bytes: stats.resourceStats?.reduce((acc, curr) => acc + (curr.encodedSize || 0), 0) || 0,
        malicious: verdicts.overall?.malicious || false,
        has_verdicts: !!scanJson.verdicts,
        scanned_at: task.time ? new Date(task.time) : null,
        completed_at: new Date()
    };
}

export function buildScanSummary(scanJson) {
    const requests = scanJson?.data?.requests || [];
    const page = scanJson?.page || {};
    const task = scanJson?.task || {};
    const apex = extractScanIndexFields(scanJson).apex_domain;

    const summary = {
        page: scanJson.page || {},
        task: scanJson.task || {},
        verdicts: scanJson.verdicts || {},
        resourceStats: scanJson.stats?.resourceStats || [],
        serverStats: scanJson.stats?.serverStats || [],
        domainStats: scanJson.stats?.domainStats || [],
        tlsStats: scanJson.stats?.tlsStats || [],
        failedRequests: [],
        blockedRequests: [],
        largestResources: [],
        thirdPartyDomains: [],
        marketingTags: [],
        bookingOrHotelTech: [],
        securityHeaderSummary: {},
        scanLinks: scanJson.data?.links || []
    };

    const hotelKeywords = /skipper|booking|synxis|cloudbeds|siteminder|travelclick|ihotelier|stayntouch|opera|tambourine|book|reservation/i;
    const marketingKeywords = /googletagmanager|google-analytics|analytics\.google|doubleclick|facebook|fbevents|bing|clarity|siteimprove|termly|cloudflareinsights/i;

    requests.forEach(r => {
        const reqUrl = r.request?.url || '';
        const status = r.response?.status || 0;
        const size = r.response?.size || 0;
        const mime = r.response?.mimeType || '';

        // Classify Failures & Blocks
        if (status >= 400) summary.failedRequests.push({ url: reqUrl, status });
        if ([401, 403, 407].includes(status)) {
            summary.blockedRequests.push({ url: reqUrl, status, reason: 'Explicit Status Auth Denied' });
        } else if (status >= 400) {
            const serverHeader = getHeaderValue(r.response?.headers, 'server') || '';
            if (/cloudfr|s3|cloudflare/i.test(serverHeader)) {
                summary.blockedRequests.push({ url: reqUrl, status, reason: `Edge block via ${serverHeader}` });
            }
        }

        // Technology Profiling
        if (hotelKeywords.test(reqUrl)) summary.bookingOrHotelTech.push(reqUrl);
        if (marketingKeywords.test(reqUrl)) summary.marketingTags.push(reqUrl);

        // Large Resources
        if (mime.startsWith('image/') && size >= 500 * 1024) summary.largestResources.push({ url: reqUrl, size, type: 'image' });
        if (mime.includes('javascript') && size >= 250 * 1024) summary.largestResources.push({ url: reqUrl, size, type: 'script' });
        if (mime.includes('css') && size >= 100 * 1024) summary.largestResources.push({ url: reqUrl, size, type: 'stylesheet' });
    });

    // Extract Security Headers from Primary Main Document Request
    const primaryReq = requests.find(r => r.response?.status === page.status);
    if (primaryReq?.response?.headers) {
        const headers = primaryReq.response.headers;
        summary.securityHeaderSummary = {
            contentSecurityPolicy: getHeaderValue(headers, 'content-security-policy'),
            strictTransportSecurity: getHeaderValue(headers, 'strict-transport-security'),
            xFrameOptions: getHeaderValue(headers, 'x-frame-options'),
            xContentTypeOptions: getHeaderValue(headers, 'x-content-type-options')
        };
    }

    return summary;
}

export function normalizeScanRequests(scanJson) {
    const requests = scanJson?.data?.requests || [];
    const index = extractScanIndexFields(scanJson);

    return requests.map(r => {
        const reqUrl = r.request?.url || '';
        let host = '';
        try { host = new url.URL(reqUrl).hostname; } catch { }

        const status = r.response?.status || 0;
        const serverHeader = getHeaderValue(r.response?.headers, 'server') || '';

        let isThirdParty = false;
        if (host && index.domain) {
            isThirdParty = host !== index.domain && !host.endsWith('.' + index.apex_domain);
        }

        let isBlocked = [401, 403, 407].includes(status);
        if (!isBlocked && status >= 400) {
            isBlocked = /cloudfr|s3|cloudflare/i.test(serverHeader);
        }

        return {
            request_id: r.request?.id || null,
            url: reqUrl,
            host,
            method: r.request?.method || 'GET',
            resource_type: r.response?.mimeType || null,
            status,
            status_text: r.response?.statusText || null,
            mime_type: r.response?.mimeType || null,
            remote_ip: r.response?.remoteIPAddress || null,
            remote_port: r.response?.remotePort || null,
            server_name: serverHeader || null,
            size_bytes: r.response?.size || 0,
            encoded_size_bytes: r.response?.encodedSize || 0,
            is_third_party: isThirdParty,
            is_failed: status >= 400,
            is_blocked: isBlocked,
            headers_json: r.response?.headers || {},
            raw_request_json: r
        };
    });
}

function getHeaderValue(headers, key) {
    if (!headers) return null;
    if (Array.isArray(headers)) {
        const match = headers.find(h => h.name?.toLowerCase() === key.toLowerCase());
        return match ? match.value : null;
    }
    return headers[key] || headers[key.toLowerCase()] || null;
}