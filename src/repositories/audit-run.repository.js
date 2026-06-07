import { query } from "../db/postgres.js";

function toJson(value) {
  return JSON.stringify(value ?? {});
}

function normalizeLimit(value, fallback = 10, max = 100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function normalizeOffset(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

export async function createAuditRunStart(payload) {
  const {
    targetUrl,
    normalizedUrl,
    domain,
    path,
    renderMode = "static",
    viewport = "desktop",
    requestedOptions = {},
  } = payload;

  const result = await query(
    `
    INSERT INTO audit_runs (
      target_url,
      normalized_url,
      domain,
      path,
      render_mode,
      viewport,
      status,
      requested_options
    )
    VALUES ($1, $2, $3, $4, $5, $6, 'running', $7::jsonb)
    RETURNING id, created_at
    `,
    [
      targetUrl,
      normalizedUrl,
      domain,
      path,
      renderMode,
      viewport,
      toJson(requestedOptions),
    ],
  );

  return result.rows[0];
}

export async function completeAuditRun(auditId, payload) {
  const {
    httpStatus = null,
    responseTimeMs = null,
    resultJson = {},
    overallScore = null,
    technicalScore = null,
    hotelCommercialScore = null,
    performanceScore = null,
    accessibilityScore = null,
  } = payload;

  const result = await query(
    `
    UPDATE audit_runs
    SET
      status = 'completed',
      http_status = $2,
      response_time_ms = $3,
      result_json = $4::jsonb,
      error_json = NULL,
      overall_score = $5,
      technical_score = $6,
      hotel_commercial_score = $7,
      performance_score = $8,
      accessibility_score = $9,
      completed_at = now()
    WHERE id = $1
    RETURNING *
    `,
    [
      auditId,
      httpStatus,
      responseTimeMs,
      toJson(resultJson),
      overallScore,
      technicalScore,
      hotelCommercialScore,
      performanceScore,
      accessibilityScore,
    ],
  );

  return result.rows[0] || null;
}

export async function failAuditRun(auditId, payload) {
  const { httpStatus = null, responseTimeMs = null, errorJson = {} } = payload;

  const result = await query(
    `
    UPDATE audit_runs
    SET
      status = 'failed',
      http_status = $2,
      response_time_ms = $3,
      error_json = $4::jsonb,
      completed_at = now()
    WHERE id = $1
    RETURNING *
    `,
    [auditId, httpStatus, responseTimeMs, toJson(errorJson)],
  );

  return result.rows[0] || null;
}

export async function getAuditRunById(auditId) {
  const result = await query(
    `
    SELECT *
    FROM audit_runs
    WHERE id = $1
    `,
    [auditId],
  );

  return result.rows[0] || null;
}

export async function listAuditRuns({ domain, limit = 10, offset = 0 }) {
  const safeLimit = normalizeLimit(limit);
  const safeOffset = normalizeOffset(offset);

  if (domain) {
    const result = await query(
      `
      SELECT
        id,
        target_url,
        normalized_url,
        domain,
        path,
        render_mode,
        viewport,
        status,
        http_status,
        response_time_ms,
        overall_score,
        technical_score,
        hotel_commercial_score,
        performance_score,
        accessibility_score,
        created_at,
        completed_at
      FROM audit_runs
      WHERE domain = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
      `,
      [domain, safeLimit, safeOffset],
    );

    return result.rows;
  }

  const result = await query(
    `
    SELECT
      id,
      target_url,
      normalized_url,
      domain,
      path,
      render_mode,
      viewport,
      status,
      http_status,
      response_time_ms,
      overall_score,
      technical_score,
      hotel_commercial_score,
      performance_score,
      accessibility_score,
      created_at,
      completed_at
    FROM audit_runs
    ORDER BY created_at DESC
    LIMIT $1 OFFSET $2
    `,
    [safeLimit, safeOffset],
  );

  return result.rows;
}
