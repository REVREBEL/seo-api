CREATE TABLE IF NOT EXISTS url_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    source_scan_id TEXT,
    source_provider TEXT NOT NULL DEFAULT 'internal',

    target_url TEXT NOT NULL,
    normalized_url TEXT,
    final_url TEXT,
    domain TEXT,
    apex_domain TEXT,
    path TEXT,

    scan_status TEXT NOT NULL DEFAULT 'completed',
    scan_method TEXT,
    scan_source TEXT,

    report_url TEXT,
    screenshot_url TEXT,
    dom_url TEXT,

    http_status INTEGER,
    page_title TEXT,
    mime_type TEXT,
    server_name TEXT,

    total_requests INTEGER,
    failed_request_count INTEGER,
    blocked_request_count INTEGER,
    third_party_domain_count INTEGER,
    third_party_request_count INTEGER,

    total_size_bytes BIGINT,
    encoded_size_bytes BIGINT,

    malicious BOOLEAN,
    has_verdicts BOOLEAN,

    provider_submission_json JSONB,
    provider_status TEXT,
    provider_error_json JSONB,

    requested_options JSONB NOT NULL DEFAULT '{}'::jsonb,

    summary_json JSONB,
    raw_scan_json JSONB,
    error_json JSONB,

    submitted_at TIMESTAMPTZ,
    result_retrieved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    scanned_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS url_scan_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id UUID NOT NULL REFERENCES url_scans(id) ON DELETE CASCADE,

    request_id TEXT,
    request_uuid TEXT,

    url TEXT NOT NULL,
    host TEXT,
    method TEXT,
    resource_type TEXT,
    initiator_type TEXT,
    initiator_host TEXT,

    status INTEGER,
    status_text TEXT,
    mime_type TEXT,
    protocol TEXT,
    security_state TEXT,

    remote_ip TEXT,
    remote_port INTEGER,
    asn TEXT,
    asn_name TEXT,
    asn_org TEXT,
    country TEXT,
    region TEXT,
    city TEXT,

    server_name TEXT,
    content_type TEXT,
    cache_control TEXT,

    size_bytes BIGINT,
    encoded_size_bytes BIGINT,
    data_length_bytes BIGINT,

    is_primary_request BOOLEAN DEFAULT false,
    is_same_site BOOLEAN,
    is_third_party BOOLEAN,
    is_failed BOOLEAN,
    is_blocked BOOLEAN,

    headers_json JSONB,
    security_details_json JSONB,
    raw_request_json JSONB NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Performance Performance Indexes
CREATE INDEX IF NOT EXISTS idx_url_scans_domain_created_at ON url_scans (domain, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_url_scans_apex_domain_created_at ON url_scans (apex_domain, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_url_scans_source_scan_id ON url_scans (source_provider, source_scan_id);
CREATE INDEX IF NOT EXISTS idx_url_scans_status ON url_scans (scan_status);
CREATE INDEX IF NOT EXISTS idx_url_scans_raw_json_gin ON url_scans USING GIN (raw_scan_json);
CREATE INDEX IF NOT EXISTS idx_url_scans_summary_json_gin ON url_scans USING GIN (summary_json);
CREATE INDEX IF NOT EXISTS idx_url_scans_provider_submission_json_gin ON url_scans USING GIN (provider_submission_json);

CREATE INDEX IF NOT EXISTS idx_url_scan_requests_scan_id ON url_scan_requests (scan_id);
CREATE INDEX IF NOT EXISTS idx_url_scan_requests_host ON url_scan_requests (host);
CREATE INDEX IF NOT EXISTS idx_url_scan_requests_status ON url_scan_requests (status);
CREATE INDEX IF NOT EXISTS idx_url_scan_requests_resource_type ON url_scan_requests (resource_type);
CREATE INDEX IF NOT EXISTS idx_url_scan_requests_is_failed ON url_scan_requests (is_failed);
CREATE INDEX IF NOT EXISTS idx_url_scan_requests_is_third_party ON url_scan_requests (is_third_party);
CREATE INDEX IF NOT EXISTS idx_url_scan_requests_raw_json_gin ON url_scan_requests USING GIN (raw_request_json);