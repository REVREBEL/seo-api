-- Up Migration
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS audit_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    target_url TEXT NOT NULL,
    normalized_url TEXT,
    domain TEXT,
    path TEXT,

    render_mode TEXT NOT NULL DEFAULT 'static',
    viewport TEXT DEFAULT 'desktop',

    status TEXT NOT NULL DEFAULT 'running',
    http_status INTEGER,
    response_time_ms INTEGER,

    requested_options JSONB NOT NULL DEFAULT '{}'::jsonb,
    result_json JSONB,
    error_json JSONB,

    overall_score NUMERIC,
    technical_score NUMERIC,
    hotel_commercial_score NUMERIC,
    performance_score NUMERIC,
    accessibility_score NUMERIC,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_audit_runs_domain_created_at
ON audit_runs (domain, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_runs_target_url_created_at
ON audit_runs (target_url, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_runs_status
ON audit_runs (status);

CREATE INDEX IF NOT EXISTS idx_audit_runs_result_json_gin
ON audit_runs USING GIN (result_json);

CREATE INDEX IF NOT EXISTS idx_audit_runs_requested_options_gin
ON audit_runs USING GIN (requested_options);

-- Down Migration
DROP TABLE audit_runs;
