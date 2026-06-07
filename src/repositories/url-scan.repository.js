// Dynamic DB import mapping project patterns
import db from '../db/index.js';

export async function createUrlScanFromParsedScan(parsed) {
    const query = `
    INSERT INTO url_scans (
      source_scan_id, source_provider, target_url, normalized_url, final_url,
      domain, apex_domain, path, scan_status, scan_method, scan_source,
      report_url, screenshot_url, dom_url, http_status, page_title, mime_type,
      server_name, total_requests, failed_request_count, blocked_request_count,
      third_party_domain_count, third_party_request_count, total_size_bytes,
      encoded_size_bytes, malicious, has_verdicts, summary_json, raw_scan_json,
      scanned_at, completed_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
      $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31
    ) RETURNING id;
  `;

    const values = [
        parsed.source_scan_id, parsed.source_provider, parsed.target_url, parsed.normalized_url, parsed.final_url,
        parsed.domain, parsed.apex_domain, parsed.path, parsed.scan_status, parsed.scan_method, parsed.scan_source,
        parsed.report_url, parsed.screenshot_url, parsed.dom_url, parsed.http_status, parsed.page_title, parsed.mime_type,
        parsed.server_name, parsed.total_requests, parsed.failed_request_count, parsed.blocked_request_count,
        parsed.third_party_domain_count, parsed.third_party_request_count, parsed.total_size_bytes,
        parsed.encoded_size_bytes, parsed.malicious, parsed.has_verdicts, JSON.stringify(parsed.summary),
        JSON.stringify(parsed.rawScanJson), parsed.scanned_at, parsed.completed_at
    ];

    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const res = await client.query(query, values);
        const scanId = res.rows[0].id;

        if (parsed.normalizedRequests && parsed.normalizedRequests.length > 0) {
            await insertUrlScanRequestsWithClient(client, scanId, parsed.normalizedRequests);
        }

        await client.query('COMMIT');
        return scanId;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

export async function createCloudflareScanSubmissionStart(targetUrl, options = {}) {
    const query = `
    INSERT INTO url_scans (
      target_url, source_provider, scan_status, requested_options, submitted_at
    ) VALUES ($1, 'cloudflare', 'submitted', $2, now()) RETURNING id;
  `;
    const res = await db.query(query, [targetUrl, JSON.stringify(options)]);
    return res.rows[0].id;
}

export async function markCloudflareScanSubmitted(scanId, payload) {
    const query = `
    UPDATE url_scans 
    SET source_scan_id = $1, provider_submission_json = $2, provider_status = 'pending'
    WHERE id = $3;
  `;
    await db.query(query, [payload?.uuid || payload?.result?.uuid || null, JSON.stringify(payload), scanId]);
}

export async function completeCloudflareScanFromResult(scanId, parsed) {
    const query = `
    UPDATE url_scans SET
      source_scan_id = $1, final_url = $2, domain = $3, apex_domain = $4, path = $5,
      scan_status = 'completed', report_url = $6, screenshot_url = $7, dom_url = $8,
      http_status = $9, page_title = $10, mime_type = $11, server_name = $12,
      total_requests = $13, failed_request_count = $14, blocked_request_count = $15,
      third_party_domain_count = $16, third_party_request_count = $17, total_size_bytes = $18,
      encoded_size_bytes = $19, malicious = $20, has_verdicts = $21, summary_json = $22,
      raw_scan_json = $23, result_retrieved_at = now(), scanned_at = $24, completed_at = now()
    WHERE id = $25;
  `;

    const values = [
        parsed.source_scan_id, parsed.final_url, parsed.domain, parsed.apex_domain, parsed.path,
        parsed.report_url, parsed.screenshot_url, parsed.dom_url, parsed.http_status, parsed.page_title,
        parsed.mime_type, parsed.server_name, parsed.total_requests, parsed.failed_request_count,
        parsed.blocked_request_count, parsed.third_party_domain_count, parsed.third_party_request_count,
        parsed.total_size_bytes, parsed.encoded_size_bytes, parsed.malicious, parsed.has_verdicts,
        JSON.stringify(parsed.summary), JSON.stringify(parsed.rawScanJson), parsed.scanned_at, scanId
    ];

    const client = await db.connect();
    try {
        await client.query('BEGIN');
        await client.query(query, values);

        // Clear legacy cache if retrying or processing async
        await client.query('DELETE FROM url_scan_requests WHERE scan_id = $1', [scanId]);
        if (parsed.normalizedRequests && parsed.normalizedRequests.length > 0) {
            await insertUrlScanRequestsWithClient(client, scanId, parsed.normalizedRequests);
        }
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

export async function failCloudflareScan(scanId, errorPayload) {
    const query = `
    UPDATE url_scans 
    SET scan_status = 'failed', provider_status = 'failed', provider_error_json = $1, error_json = $1
    WHERE id = $2;
  `;
    await db.query(query, [JSON.stringify(errorPayload), scanId]);
}

export async function getUrlScanById(scanId, options = {}) {
    const query = `SELECT * FROM url_scans WHERE id = $1;`;
    const res = await db.query(query, [scanId]);
    if (res.rows.length === 0) return null;

    const scan = res.rows[0];
    const responseObj = {
        success: true,
        scan: {
            scanId: scan.id,
            sourceProvider: scan.source_provider,
            sourceScanId: scan.source_scan_id,
            targetUrl: scan.target_url,
            domain: scan.domain,
            apexDomain: scan.apex_domain,
            status: scan.scan_status,
            summary: scan.summary_json || {}
        }
    };

    if (options.includeRaw === true) {
        responseObj.rawScan = scan.raw_scan_json || {};
    }

    if (options.includeRequests === true) {
        const reqs = await db.query(`SELECT * FROM url_scan_requests WHERE scan_id = $1`, [scanId]);
        responseObj.requests = reqs.rows;
    }

    return responseObj;
}

export async function listUrlScans(filters = {}) {
    let query = `SELECT id, source_provider, source_scan_id, target_url, domain, apex_domain, scan_status, summary_json, created_at FROM url_scans WHERE 1=1`;
    const params = [];

    if (filters.domain) {
        params.push(filters.domain);
        query += ` AND domain = $${params.length}`;
    }
    if (filters.apexDomain) {
        params.push(filters.apexDomain);
        query += ` AND apex_domain = $${params.length}`;
    }
    if (filters.sourceProvider) {
        params.push(filters.sourceProvider);
        query += ` AND source_provider = $${params.length}`;
    }

    const limit = parseInt(filters.limit) || 20;
    const offset = parseInt(filters.offset) || 0;

    params.push(limit, offset);
    query += ` ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const res = await db.query(query, params);
    return res.rows.map(row => ({
        scanId: row.id,
        sourceProvider: row.source_provider,
        sourceScanId: row.source_scan_id,
        targetUrl: row.target_url,
        domain: row.domain,
        apexDomain: row.apex_domain,
        status: row.scan_status,
        summary: row.summary_json || {},
        createdAt: row.created_at
    }));
}

async function insertUrlScanRequestsWithClient(client, scanId, normalizedRequests) {
    const insertStatement = `
    INSERT INTO url_scan_requests (
      scan_id, request_id, url, host, method, resource_type, status, status_text,
      mime_type, remote_ip, remote_port, server_name, size_bytes, encoded_size_bytes,
      is_third_party, is_failed, is_blocked, headers_json, raw_request_json
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19);
  `;

    for (const r of normalizedRequests) {
        await client.query(insertStatement, [
            scanId, r.request_id, r.url, r.host, r.method, r.resource_type, r.status, r.status_text,
            r.mime_type, r.remote_ip, r.remote_port, r.server_name, r.size_bytes, r.encoded_size_bytes,
            r.is_third_party, r.is_failed, r.is_blocked, JSON.stringify(r.headers_json), JSON.stringify(r.raw_request_json)
        ]);
    }
}
