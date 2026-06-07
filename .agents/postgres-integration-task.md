# seo-api Phase 2A Work Order — Postgres Audit Persistence + Benchmarking Foundation

## Project

**Project name:** `seo-api`  
**Backend URL:** `https://seo-api.revrebel.io`  
**Runtime:** Node.js / Express  
**Process manager:** PM2  
**Frontend/reverse proxy:** Nginx  
**Node manager:** Volta  
**Database:** Existing local Postgres server on the same Ubuntu host

## Mission

The `seo-api` backend is now recovered, deployed, and passing its MVP smoke tests.

The next phase is to add Postgres-backed persistence so every audit execution is saved, recoverable by ID, and available for historical benchmarking.

This phase is about execution history and benchmark readiness. Do not add new SEO extraction features, new scoring logic, sitemap crawling, dashboards, PDF generation, or agent workflows yet.

---

## Why This Matters

The API currently behaves like a stateless audit tool:

1. Agent calls `POST /api/audit`
2. API runs the audit
3. API returns JSON
4. Result is lost unless the agent stores it somewhere

That is not reliable enough for agent workflows.

If an agent disconnects, times out, loses context, or needs to reference a prior audit, the backend needs to provide a durable execution record.

The Postgres layer should allow:

- Looking up a previous audit by `auditId`
- Listing recent audits for a domain
- Comparing repeated audits over time
- Benchmarking multiple sites
- Building future client reporting
- Supporting before/after optimization tracking
- Allowing an agent to recover prior work without relying on conversation memory

---

## Target Architecture

```text
Agent / Gemini / Nexus
  ↓
POST /api/audit
  ↓
seo-api backend
  ↓
Run audit
  ↓
Write execution record to Postgres
  ↓
Return auditId + result
```

Then later:

```text
GET /api/audit/:auditId
  → retrieve prior execution

GET /api/audits?domain=example.com
  → list recent audits for a domain

GET /api/compare?baseAuditId=...&compareAuditId=...
  → future comparison endpoint
```

---

## Scope For This Phase

### In Scope

- Add Postgres connection support
- Add migration SQL
- Add migration runner
- Add `audit_runs` table
- Save every audit execution to Postgres
- Return `auditId` from `POST /api/audit`
- Retrieve a stored audit by ID
- List recent audit runs by domain
- Extract benchmarkable scores into columns
- Preserve full JSON result in `JSONB`
- Update OpenAPI
- Update README
- Add smoke test examples
- Create initial audit_runs migration
- Create migration tracking table automatically
- Add npm scripts
- Document migration workflow

### Out Of Scope

Do not work on:

- Sitemap crawling
- Full-site crawling
- New SEO scoring rules
- New hotel scoring rules
- PDF reports
- Dashboards
- Database admin UI
- OTA scraping
- Booking engine scraping
- Agent Designer setup
- New AI summaries
- User authentication UI
- Multi-tenant account management

---

## Database Design Philosophy

Use both normalized columns and `JSONB`.

### Why JSONB?

The full audit response may evolve over time. Storing the complete response as `JSONB` keeps the system flexible.

### Why Score Columns?

Benchmarking needs fast, simple queries. Extracting key scores into real columns makes it easy to trend and compare audits.

Example benchmark query:

```sql
SELECT
  domain,
  created_at,
  overall_score,
  technical_score,
  hotel_commercial_score
FROM audit_runs
WHERE domain = 'example.com'
ORDER BY created_at DESC;
```

---

## Required Environment Variables

Update `.env.example` and production `.env`.

Preferred single variable:

```env
DATABASE_URL=postgresql://seo_api_user:REPLACE_WITH_PASSWORD@localhost:5432/seo_api
```

Also keep existing app variables:

```env
NODE_ENV=production
PORT=3000
REVREBEL_API_KEY=replace-with-secure-api-key
```

Optional separate Postgres variables may be supported, but `DATABASE_URL` is preferred for simplicity.

---

## Postgres Setup

These commands should be run on the Ubuntu server.

### 1. Enter Postgres

Depending on the server setup:

```bash
sudo -u postgres psql
```

### 2. Create Database And User

Use a secure password.

```sql
CREATE DATABASE seo_api;

CREATE USER seo_api_user WITH PASSWORD 'replace-with-secure-password';

GRANT ALL PRIVILEGES ON DATABASE seo_api TO seo_api_user;
```

### 3. Connect To The Database

```sql
\c seo_api
```

### 4. Grant Public Schema Privileges

For modern Postgres versions, also grant schema privileges:

```sql
GRANT ALL ON SCHEMA public TO seo_api_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT ALL ON TABLES TO seo_api_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT ALL ON SEQUENCES TO seo_api_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT ALL ON FUNCTIONS TO seo_api_user;
```

### 5. Exit

```sql
\q
```

### 6. Test Connection

From the app user shell:

```bash
psql "postgresql://seo_api_user:replace-with-secure-password@localhost:5432/seo_api"
```

Then:

```sql
SELECT now();
\q
```

---

## Required NPM Package

Install:

```bash
volta run npm install pg
```

or, if the shell is already using Volta correctly:

```bash
npm install pg
```

Do not use `sudo npm install`.

---

## Required File Additions

Add the following files:

```text
src/db/postgres.js
src/repositories/audit-run.repository.js
db/migrations/001_create_audit_runs.sql
```

Update these files:

```text
src/routes/audit.routes.js
public/openapi.json
README.md
.env.example
package.json
```

---

## Migration SQL

Create:

```text
db/migrations/001_create_audit_runs.sql
```

Use this SQL:

```sql
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
```

### Run Migration

From the project root:

```bash
psql "$DATABASE_URL" -f db/migrations/001_create_audit_runs.sql
```

If the shell does not have `DATABASE_URL` loaded, use:

```bash
psql "postgresql://seo_api_user:replace-with-secure-password@localhost:5432/seo_api" \
  -f db/migrations/001_create_audit_runs.sql
```

---

## Database Connection Module

Create:

```text
src/db/postgres.js
```

Recommended implementation:

```js
import pg from "pg";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn(
    "DATABASE_URL is not set. Postgres persistence will fail until configured.",
  );
}

export const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export async function query(text, params = []) {
  return pool.query(text, params);
}

export async function testConnection() {
  const result = await query("SELECT now() AS now");
  return result.rows[0];
}

export async function closePool() {
  await pool.end();
}
```

Notes:

- Do not crash the app on import if `DATABASE_URL` is missing.
- Routes that need persistence should return clean JSON errors if the DB is unavailable.
- Later we can make DB required in production, but for this phase keep it implementation-safe.

---

## Migration Framework Requirement

Do not rely only on manually running raw SQL files with `psql`.

Add a migration runner so future database changes can be applied safely and repeatedly.

Preferred lightweight option:

````bash
npm install node-pg-migrate

Add migration folder:

db/migrations/

Add npm scripts:

{
  "scripts": {
    "db:migrate": "node-pg-migrate up",
    "db:rollback": "node-pg-migrate down",
    "db:migrate:create": "node-pg-migrate create"
  }
}

Use DATABASE_URL for migration connection.

The first migration should create:

audit_runs
indexes for audit_runs
pgcrypto extension

Acceptance criteria:

npm run db:migrate creates the tables the first time.
Running npm run db:migrate again does not duplicate tables.
Migration state is tracked.
Future migrations can be added without manually editing production tables.



## Audit Run Repository

Create:

```text
src/repositories/audit-run.repository.js
````

Required exports:

```js
createAuditRunStart(payload);
completeAuditRun(auditId, payload);
failAuditRun(auditId, payload);
getAuditRunById(auditId);
listAuditRuns({ domain, limit, offset });
```

Recommended implementation:

```js
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
```

---

## URL Normalization Helper

The route needs to extract:

- normalized URL
- domain
- path

If there is already a utility for URL validation, extend or reuse it. Otherwise add a small helper in the route or a utility file.

Recommended logic:

```js
function getUrlParts(url) {
  const parsed = new URL(url);

  return {
    normalizedUrl: parsed.href,
    domain: parsed.hostname.replace(/^www\./, ""),
    path: parsed.pathname || "/",
  };
}
```

---

## Score Extraction Helper

Add a helper in `audit.routes.js` or a new file:

```text
src/utils/score-extraction.js
```

Recommended implementation:

```js
function toNumberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function extractScoresForPersistence(auditResult) {
  const scorecard = auditResult?.scorecard || {};

  return {
    overallScore: toNumberOrNull(
      scorecard.overallScore ?? scorecard.overall ?? scorecard.score,
    ),
    technicalScore: toNumberOrNull(
      scorecard.technicalScore ??
        scorecard.technicalSeo ??
        auditResult?.technicalSeo?.score,
    ),
    hotelCommercialScore: toNumberOrNull(
      scorecard.hotelCommercialScore ??
        scorecard.hotelCommercial ??
        auditResult?.hotelCommercial?.score,
    ),
    performanceScore: toNumberOrNull(
      scorecard.performanceScore ??
        scorecard.performance ??
        auditResult?.performance?.score,
    ),
    accessibilityScore: toNumberOrNull(
      scorecard.accessibilityScore ??
        scorecard.accessibility ??
        auditResult?.accessibility?.score,
    ),
  };
}
```

If the existing scorecard uses different field names, adapt this helper to match the real response.

Do not fail the audit if scores are missing. Store `null`.

---

## Required Route Changes

Update:

```text
src/routes/audit.routes.js
```

### Add Imports

```js
import {
  createAuditRunStart,
  completeAuditRun,
  failAuditRun,
  getAuditRunById,
  listAuditRuns,
} from "../repositories/audit-run.repository.js";
```

Also import score extraction helper if created:

```js
import { extractScoresForPersistence } from "../utils/score-extraction.js";
```

### Update POST `/api/audit`

Current flow should become:

1. Validate URL.
2. Normalize URL/domain/path.
3. Insert `running` audit row.
4. Run existing audit pipeline.
5. Build audit result JSON.
6. Extract benchmark scores.
7. Update row to `completed`.
8. Return result with `auditId`.

### Important Behavior

If audit execution fails after the audit row was created:

- Save `status = 'failed'`
- Save `error_json`
- Return clean JSON error with `auditId`

If Postgres is unavailable before the audit starts:

- Return `500`
- Do not run the audit without persistence in this phase unless explicitly configured later.

Recommended response on DB failure:

```json
{
  "success": false,
  "error": "Database persistence is unavailable",
  "message": "..."
}
```

### Successful Response Shape

```json
{
  "success": true,
  "auditId": "uuid",
  "targetUrl": "https://example.com/",
  "status": "completed",
  "result": {
    "technicalSeo": {},
    "hotelCommercial": {},
    "scorecard": {}
  }
}
```

### Failed Response Shape

```json
{
  "success": false,
  "auditId": "uuid-if-created",
  "status": "failed",
  "error": "Failed to audit URL",
  "message": "Helpful error message"
}
```

---

## Add Retrieval Endpoint

Add:

```http
GET /api/audit/:auditId
```

Response if found:

```json
{
  "success": true,
  "audit": {
    "auditId": "uuid",
    "targetUrl": "https://example.com/",
    "normalizedUrl": "https://example.com/",
    "domain": "example.com",
    "path": "/",
    "renderMode": "static",
    "viewport": "desktop",
    "status": "completed",
    "httpStatus": 200,
    "responseTimeMs": 123,
    "createdAt": "2026-06-06T00:00:00.000Z",
    "completedAt": "2026-06-06T00:00:01.000Z",
    "request": {},
    "result": {},
    "error": null,
    "scores": {
      "overall": 76,
      "technical": 82,
      "hotelCommercial": 64,
      "performance": null,
      "accessibility": null
    }
  }
}
```

Response if not found:

```json
{
  "success": false,
  "error": "Audit run not found"
}
```

Status: `404`.

---

## Add History Endpoint

Add:

```http
GET /api/audits
```

Supported query parameters:

```text
domain
limit
offset
```

Example:

```http
GET /api/audits?domain=example.com&limit=10
```

Response:

```json
{
  "success": true,
  "domain": "example.com",
  "count": 10,
  "audits": [
    {
      "auditId": "uuid",
      "targetUrl": "https://example.com/",
      "normalizedUrl": "https://example.com/",
      "domain": "example.com",
      "path": "/",
      "renderMode": "static",
      "viewport": "desktop",
      "status": "completed",
      "httpStatus": 200,
      "responseTimeMs": 123,
      "overallScore": 76,
      "technicalScore": 82,
      "hotelCommercialScore": 64,
      "performanceScore": null,
      "accessibilityScore": null,
      "createdAt": "2026-06-06T00:00:00.000Z",
      "completedAt": "2026-06-06T00:00:01.000Z"
    }
  ]
}
```

---

## Response Mapping Helper

Add a small helper to convert snake_case database rows to API-friendly camelCase.

Example:

```js
function mapAuditRun(row) {
  if (!row) return null;

  return {
    auditId: row.id,
    targetUrl: row.target_url,
    normalizedUrl: row.normalized_url,
    domain: row.domain,
    path: row.path,
    renderMode: row.render_mode,
    viewport: row.viewport,
    status: row.status,
    httpStatus: row.http_status,
    responseTimeMs: row.response_time_ms,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    request: row.requested_options,
    result: row.result_json,
    error: row.error_json,
    scores: {
      overall: row.overall_score,
      technical: row.technical_score,
      hotelCommercial: row.hotel_commercial_score,
      performance: row.performance_score,
      accessibility: row.accessibility_score,
    },
  };
}
```

Use this for `GET /api/audit/:auditId`.

For list responses, omit the large JSON fields.

---

## OpenAPI Updates

Update:

```text
public/openapi.json
```

The OpenAPI server URL should be:

```json
{
  "url": "https://seo-api.revrebel.io"
}
```

### Add Path: `GET /api/audit/{auditId}`

Operation ID:

```text
getAuditRun
```

Path parameter:

```text
auditId
```

Security:

```text
x-api-key
```

### Add Path: `GET /api/audits`

Operation ID:

```text
listAuditRuns
```

Query parameters:

```text
domain
limit
offset
```

Security:

```text
x-api-key
```

### Existing Path: `POST /api/audit`

Operation ID should remain:

```text
auditSeoPage
```

Update the success response schema so it includes:

```text
auditId
status
result
```

---

## README Updates

Add a new section:

```md
## Postgres Persistence
```

Include:

- How to create the database
- How to create the user
- How to set `DATABASE_URL`
- How to run migration
- How to test persistence
- How to retrieve an audit by ID
- How to list audit history by domain

### README Commands

Include:

```bash
psql "$DATABASE_URL" -f db/migrations/001_create_audit_runs.sql
```

Create audit:

```bash
curl -X POST https://seo-api.revrebel.io/api/audit \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
  -d '{"url":"https://example.com","renderMode":"static"}'
```

Retrieve audit:

```bash
curl https://seo-api.revrebel.io/api/audit/YOUR_AUDIT_ID \
  -H "x-api-key: your-api-key"
```

List audits:

```bash
curl "https://seo-api.revrebel.io/api/audits?domain=example.com&limit=10" \
  -H "x-api-key: your-api-key"
```

---

## Smoke Test Sequence

After implementation, run:

```bash
node --check src/db/postgres.js
node --check src/repositories/audit-run.repository.js
node --check src/routes/audit.routes.js
node --check src/utils/score-extraction.js
```

Then:

```bash
npm start
```

or through PM2:

```bash
pm2 restart seo-api
pm2 logs seo-api
```

Test health:

```bash
curl https://seo-api.revrebel.io/health
```

Test OpenAPI:

```bash
curl https://seo-api.revrebel.io/openapi.json
```

Test audit creation:

```bash
curl -X POST https://seo-api.revrebel.io/api/audit \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
  -d '{"url":"https://example.com","renderMode":"static"}'
```

Capture `auditId`.

Test retrieval:

```bash
curl https://seo-api.revrebel.io/api/audit/YOUR_AUDIT_ID \
  -H "x-api-key: your-api-key"
```

Test history:

```bash
curl "https://seo-api.revrebel.io/api/audits?domain=example.com&limit=10" \
  -H "x-api-key: your-api-key"
```

Confirm in Postgres:

```bash
psql "$DATABASE_URL"
```

Then:

```sql
SELECT
  id,
  domain,
  status,
  overall_score,
  technical_score,
  hotel_commercial_score,
  created_at
FROM audit_runs
ORDER BY created_at DESC
LIMIT 10;
```

---

## PM2 Notes

After code changes:

```bash
pm2 restart seo-api
pm2 logs seo-api
```

If PM2 is not yet running:

```bash
pm2 start ecosystem.config.cjs
pm2 save
```

Remember: this project uses local app users under `/home`, Volta for Node, and `cwd: __dirname` in `ecosystem.config.cjs`.

Do not hard-code `/var/www`.

---

## Acceptance Criteria

This phase is complete when:

1. Existing recovery MVP tests still pass.
2. `pg` is installed.
3. `DATABASE_URL` is documented in `.env.example`.
4. Migration file exists.
5. Migration creates `audit_runs`.
6. `POST /api/audit` creates a `running` row.
7. Successful audit updates the row to `completed`.
8. Failed audit updates the row to `failed`.
9. `POST /api/audit` returns `auditId`.
10. `GET /api/audit/:auditId` returns the stored full result.
11. `GET /api/audits?domain=example.com` returns recent audit summaries.
12. Score columns are populated when available.
13. Missing scores are stored as `null`, not treated as failures.
14. OpenAPI includes all new endpoints.
15. README includes Postgres setup and audit lookup examples.
16. No new SEO feature work was added in this phase.

---

## Future Phase Notes

After this phase, future enhancements can include:

- `GET /api/compare?baseAuditId=...&compareAuditId=...`
- Portfolio benchmarking by client/property group
- Scheduled audits
- Sitemap crawl mode
- Competitor set comparison
- Client report generation
- Agent memory / execution recovery flows
- Trend charts
- Admin dashboard

Do not build these in Phase 2A.

---

## Final Instruction

This phase should make `seo-api` durable.

The goal is not to make the audit smarter yet. The goal is to make every audit execution persistent, recoverable, and benchmark-ready.

Build the database foundation first.
