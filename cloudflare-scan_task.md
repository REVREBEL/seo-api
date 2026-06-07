# seo-api Task — Add URL Scanner Capability With Raw Output Capture

### Instruction

This task is focused on implementation only.

The Gemini Code Agent should:

- Add the URL Scanner data model
- Add raw-output capture
- Add import support for completed scanner JSON
- Add Cloudflare live provider scaffolding
- Add REST endpoints
- Add OpenAPI documentation
- Add README documentation
- Add MCP tool definitions only if the MCP server already exists

---

## Project

**Project name:** `seo-api`  
**Backend URL:** `https://seo-api.revrebel.io`  
**Runtime:** Node.js / Express  
**Database:** Postgres  
**Migration approach:** timestamped up/down migrations using the project migration runner  
**Process manager:** PM2  
**Node manager:** Volta  
**App location:** under `/home/<app-user>/...`, not `/var/www`  
**Main API entry:** `src/index.js`  
**MCP server entry, if present:** `src/mcp/server.js`

---

## Mission

Add a URL Scanner capability to `seo-api`.

The scanner capability should preserve the complete raw output from a Cloudflare-style URL Scanner result and prepare the system to submit live Cloudflare URL Scanner jobs later.

The core rule:

```text
Capture everything first. Curate later.
```

Do not discard fields from the scanner API output.

---

## Current Build Order Context

The intended project order is:

```text
1. Recovery MVP
2. Postgres persistence for /api/audit
3. Migration runner
4. URL Scanner raw storage and import
5. Cloudflare live URL Scanner provider scaffolding
6. MCP wrapper/tool exposure
7. Codex/API testing task
8. Curated summaries and benchmarking
```

This task covers items 4, 5, and related documentation.

This task does not cover item 7. API testing is deferred.

---

## Non-Negotiable Data Policy

The scanner result must be stored in full.

The database must preserve:

```text
Full raw API output
Full request/response event list
Full task metadata
Full page metadata
Full stats object
Full verdicts object
Full detected technology/list data
Full cookies data
Full console output
Full links/globals/performance data if present
Unknown future fields
Provider-specific fields
```

The system may derive summaries and normalized request rows, but the raw payload is the source of truth.

---

## Existing Reference Payload

A Cloudflare-style scanner JSON example has been provided from a scan of:

```text
https://www.staynownow.com/
```

The example includes sections like:

```text
data
lists
meta
page
scanner
stats
task
verdicts
```

Important nested data includes:

```text
data.requests
data.cookies
data.console
data.links
data.globals
data.performance
stats.domainStats
stats.ipStats
stats.protocolStats
stats.resourceStats
stats.tlsStats
stats.serverStats
page
task
verdicts
```

The implementation should not assume this list is exhaustive.

Unknown future fields must stay preserved inside `raw_scan_json`.

---

## Required Endpoints

Add these REST endpoints:

```http
POST /api/url-scan/import
POST /api/url-scan
GET  /api/url-scan/:scanId
GET  /api/url-scans
POST /api/url-scan/:scanId/refresh
```

All `/api/*` endpoints must require the existing `x-api-key` authentication.

---

## Endpoint Responsibilities

### 1. `POST /api/url-scan/import`

Purpose:

Import a completed Cloudflare-style scanner JSON result.

This endpoint is for already-completed scan output.

It should accept either wrapped payload:

```json
{
  "sourceProvider": "cloudflare",
  "scan": {}
}
```

or raw scanner JSON directly:

```json
{
  "data": {},
  "stats": {},
  "task": {},
  "page": {},
  "verdicts": {}
}
```

Behavior:

1. Validate API key.
2. Accept full JSON body.
3. Detect wrapped vs raw payload.
4. Save full scan object to `url_scans.raw_scan_json`.
5. Extract lightweight index fields.
6. Build a preliminary `summary_json`.
7. Optionally insert normalized request rows into `url_scan_requests`.
8. Return local `scanId`.

Do not mutate or reduce the raw scan object before storing it.

---

### 2. `POST /api/url-scan`

Purpose:

Create a new URL scan request.

Initial provider support:

```text
provider = cloudflare
```

Optional future provider:

```text
provider = internal
```

Request example:

```json
{
  "url": "https://www.cloudflare.com",
  "provider": "cloudflare",
  "waitForResult": false
}
```

Behavior for `provider = cloudflare`:

1. Validate URL using existing secure URL validation.
2. Create a local `url_scans` row with status `submitted`.
3. Submit the URL to Cloudflare URL Scanner using server-side bearer token.
4. Store Cloudflare submission response in `provider_submission_json`.
5. Store Cloudflare provider scan ID in `source_scan_id`.
6. If `waitForResult = false`, return local `scanId` and provider scan ID.
7. If `waitForResult = true`, include polling implementation but do not require live testing in this task.
8. When final result is retrieved, store full final result in `raw_scan_json`.

Important:

The Cloudflare bearer token is server-side only.

Clients and agents should never provide the Cloudflare token.

They call `seo-api` using the normal `x-api-key`.

---

### 3. `GET /api/url-scan/:scanId`

Purpose:

Retrieve a stored URL scan.

Default response should be compact and should not include the full raw scan unless requested.

Support query params:

```text
includeRaw=true
includeRequests=true
```

Default response:

```json
{
  "success": true,
  "scan": {
    "scanId": "uuid",
    "sourceProvider": "cloudflare",
    "sourceScanId": "provider-scan-id",
    "targetUrl": "https://www.staynownow.com/",
    "domain": "www.staynownow.com",
    "apexDomain": "staynownow.com",
    "status": "completed",
    "summary": {}
  }
}
```

With `includeRaw=true`, include:

```json
{
  "rawScan": {}
}
```

With `includeRequests=true`, include normalized request rows if implemented.

---

### 4. `GET /api/url-scans`

Purpose:

List stored URL scans.

Support query params:

```text
domain
apexDomain
sourceProvider
limit
offset
```

Return compact summaries only.

Do not return full raw payloads from list endpoint.

---

### 5. `POST /api/url-scan/:scanId/refresh`

Purpose:

For Cloudflare-submitted scans, retrieve the final result after initial submission.

Behavior:

1. Validate API key.
2. Look up local scan.
3. Confirm `source_provider = 'cloudflare'`.
4. Confirm `source_scan_id` exists.
5. Call Cloudflare result endpoint using server-side bearer token.
6. Store full final result in `raw_scan_json`.
7. Rebuild `summary_json`.
8. Update status/timestamps.
9. Return compact result.

Implementation is required.

Live testing is not required in this task.

---

## Cloudflare API Authentication

Add support for these environment variables:

```env
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_URLSCANNER_API_TOKEN=
CLOUDFLARE_URLSCANNER_BASE_URL=https://api.cloudflare.com/client/v4
CLOUDFLARE_URLSCANNER_SCAN_PATH=/accounts/{accountId}/urlscanner/v2/scan
CLOUDFLARE_URLSCANNER_RESULT_PATH=/accounts/{accountId}/urlscanner/v2/result/{scanId}
CLOUDFLARE_URLSCANNER_POLL_INTERVAL_MS=3000
CLOUDFLARE_URLSCANNER_POLL_TIMEOUT_MS=60000
```

The article example uses:

```bash
curl --request POST \
  --url https://api.cloudflare.com/client/v4/accounts/<accountId>/urlscanner/scan \
  --header 'Content-Type: application/json' \
  --header "Authorization: Bearer <API_TOKEN>" \
  --data '{
    "url": "https://www.cloudflare.com"
  }'
```

The implementation should support configurable Cloudflare paths because Cloudflare examples may vary between:

```text
/accounts/{accountId}/urlscanner/scan
/accounts/{accountId}/urlscanner/v2/scan
```

Default to the v2 path, but allow `.env` override.

---

## Cloudflare Token Permissions

Document that the Cloudflare API token should be scoped to the account and should have:

```text
Account > URL Scanner > Edit
```

Do not use a global Cloudflare API key.

Do not expose token values in:

```text
API responses
OpenAPI examples
README examples
logs
MCP tool outputs
error messages
```

---

## Required Database Tables

Use timestamped migration files.

Do not manually create tables outside migrations.

Example migration naming pattern:

```text
<timestamp>_create-url-scans.up.sql
<timestamp>_create-url-scans.down.sql
```

Keep timestamp prefixes.

---

## Table: `url_scans`

Create or migrate to this table shape:

```sql
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

CREATE INDEX IF NOT EXISTS idx_url_scans_domain_created_at
ON url_scans (domain, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_url_scans_apex_domain_created_at
ON url_scans (apex_domain, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_url_scans_source_scan_id
ON url_scans (source_provider, source_scan_id);

CREATE INDEX IF NOT EXISTS idx_url_scans_status
ON url_scans (scan_status);

CREATE INDEX IF NOT EXISTS idx_url_scans_raw_json_gin
ON url_scans USING GIN (raw_scan_json);

CREATE INDEX IF NOT EXISTS idx_url_scans_summary_json_gin
ON url_scans USING GIN (summary_json);

CREATE INDEX IF NOT EXISTS idx_url_scans_provider_submission_json_gin
ON url_scans USING GIN (provider_submission_json);
```

Note:

`raw_scan_json` may be nullable for scans that have been submitted but whose final result has not yet been retrieved.

Once a completed result is available, store the full result there.

---

## Optional Table: `url_scan_requests`

Create this table if time allows.

It is useful for benchmarking and querying resource-level behavior.

This table is derived. The source of truth remains `url_scans.raw_scan_json`.

```sql
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

CREATE INDEX IF NOT EXISTS idx_url_scan_requests_scan_id
ON url_scan_requests (scan_id);

CREATE INDEX IF NOT EXISTS idx_url_scan_requests_host
ON url_scan_requests (host);

CREATE INDEX IF NOT EXISTS idx_url_scan_requests_status
ON url_scan_requests (status);

CREATE INDEX IF NOT EXISTS idx_url_scan_requests_resource_type
ON url_scan_requests (resource_type);

CREATE INDEX IF NOT EXISTS idx_url_scan_requests_is_failed
ON url_scan_requests (is_failed);

CREATE INDEX IF NOT EXISTS idx_url_scan_requests_is_third_party
ON url_scan_requests (is_third_party);

CREATE INDEX IF NOT EXISTS idx_url_scan_requests_raw_json_gin
ON url_scan_requests USING GIN (raw_request_json);
```

---

## Required Files

Add or update:

```text
src/routes/url-scan.routes.js
src/repositories/url-scan.repository.js
src/url-scanner/cloudflare-scan-parser.js
src/url-scanner/cloudflare-urlscanner-client.js
public/openapi.json
README.md
.env.example
package.json
migrations/*
```

If using MCP in this phase and the MCP server already exists, also update:

```text
src/mcp/server.js
src/mcp/tools/import-url-scan.tool.js
src/mcp/tools/get-url-scan.tool.js
src/mcp/tools/list-url-scans.tool.js
src/mcp/tools/run-cloudflare-url-scan.tool.js
src/mcp/tools/refresh-cloudflare-url-scan.tool.js
```

If MCP server does not exist yet, do not create a half-wired MCP implementation in this task. Document the tool definitions for later instead.

---

## Parser Module

Create:

```text
src/url-scanner/cloudflare-scan-parser.js
```

Exports:

```js
parseCloudflareUrlScan(scanJson);
extractScanIndexFields(scanJson);
buildScanSummary(scanJson);
normalizeScanRequests(scanJson);
```

Parser rule:

```text
The original scan JSON must be returned as rawScanJson without field reduction.
```

Example shape:

```js
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
```

---

## Index Field Extraction

Extract these fields if available:

```text
source_scan_id
source_provider
target_url
normalized_url
final_url
domain
apex_domain
path
scan_status
scan_method
scan_source
report_url
screenshot_url
dom_url
http_status
page_title
mime_type
server_name
total_requests
failed_request_count
blocked_request_count
third_party_domain_count
third_party_request_count
total_size_bytes
encoded_size_bytes
malicious
has_verdicts
```

If unavailable, store `null`.

Optional missing fields must not fail import.

---

## Summary JSON

Build `summary_json` as a convenience layer.

Suggested structure:

```json
{
  "page": {},
  "task": {},
  "verdicts": {},
  "resourceStats": [],
  "serverStats": [],
  "domainStats": [],
  "tlsStats": [],
  "failedRequests": [],
  "blockedRequests": [],
  "largestResources": [],
  "thirdPartyDomains": [],
  "marketingTags": [],
  "bookingOrHotelTech": [],
  "securityHeaderSummary": {},
  "scanLinks": {}
}
```

Do not treat summary as source of truth.

The raw payload remains source of truth.

---

## Classification Rules

### Failed requests

Classify as failed when:

```text
status >= 400
```

### Blocked requests

Classify as blocked when:

```text
status is 401, 403, or 407
```

Also flag possible CDN/edge blocking when:

```text
status >= 400
and server or headers include CloudFront, AmazonS3, Cloudflare, or similar edge/CDN infrastructure
```

### Third-party requests

Classify as third party when:

```text
request host is not the primary domain
and request host is not a subdomain of the primary apex domain
```

### Booking or hotel technology

Flag domains or technologies containing:

```text
skipper
booking
synxis
cloudbeds
siteminder
travelclick
ihotelier
stayntouch
opera
tambourine
book
reservation
reservations
```

### Marketing tags

Flag domains or technologies containing:

```text
googletagmanager
google-analytics
analytics.google
doubleclick
facebook
fbevents
bing
clarity
siteimprove
termly
cloudflareinsights
```

### Large resource thresholds

Flag resources as large when:

```text
images >= 500 KB
scripts >= 250 KB
stylesheets >= 100 KB
total page size >= 5 MB
```

---

## Cloudflare Client Module

Create:

```text
src/url-scanner/cloudflare-urlscanner-client.js
```

Exports:

```js
submitCloudflareUrlScan(payload);
getCloudflareUrlScanResult(providerScanId);
pollCloudflareUrlScanResult(providerScanId, options);
```

Behavior:

- Read Cloudflare account ID from `CLOUDFLARE_ACCOUNT_ID`
- Read bearer token from `CLOUDFLARE_URLSCANNER_API_TOKEN`
- Use `Authorization: Bearer <token>`
- Use configurable endpoint paths
- Return structured errors
- Do not expose secrets

---

## Repository Module

Create or update:

```text
src/repositories/url-scan.repository.js
```

Exports:

```js
createUrlScanFromParsedScan(parsed);
createCloudflareScanSubmissionStart(payload);
markCloudflareScanSubmitted(scanId, payload);
completeCloudflareScanFromResult(scanId, parsed);
failCloudflareScan(scanId, errorPayload);
getUrlScanById(scanId, options);
listUrlScans(filters);
insertUrlScanRequests(scanId, normalizedRequests);
```

Use transactions when inserting a scan and optional request rows.

---

## Route Registration

Update `src/index.js` to mount the route if needed:

```js
import urlScanRoutes from "./routes/url-scan.routes.js";

app.use("/api", requireApiKey, auditRoutes);
app.use("/api", requireApiKey, urlScanRoutes);
```

If current route mounting is structured differently, follow the existing project convention.

---

## OpenAPI Updates

Update:

```text
public/openapi.json
```

Add or update:

```text
POST /api/url-scan/import
POST /api/url-scan
GET /api/url-scan/{scanId}
GET /api/url-scans
POST /api/url-scan/{scanId}/refresh
```

Operation IDs:

```text
importUrlScan
runUrlScan
getUrlScan
listUrlScans
refreshUrlScanResult
```

Document:

- `includeRaw`
- `includeRequests`
- `provider = cloudflare`
- `waitForResult`
- `x-api-key` required for `/api/*`
- Cloudflare token is server-side only

---

## MCP Notes

If the MCP server is already implemented at:

```text
src/mcp/server.js
```

then add tools:

```text
import_url_scan
get_url_scan
list_url_scans
run_cloudflare_url_scan
refresh_cloudflare_url_scan
```

If MCP is not implemented yet, do not block this task.

Document these as future MCP tools.

Canonical MCP path:

```text
src/mcp/server.js
```

Canonical package script:

```json
"start:mcp": "node src/mcp/server.js"
```

Do not use:

```text
mcp/server.js
```

unless the project has intentionally chosen that structure.

---

## README Updates

Add a section:

```md
## URL Scanner
```

Include:

- What the scanner does
- How it differs from `/api/audit`
- Raw output preservation policy
- Import endpoint
- Cloudflare live provider endpoint
- Retrieval endpoint
- History endpoint
- Refresh endpoint
- Required environment variables
- Cloudflare token permission
- Example curl commands

Example import:

```bash
curl -X POST https://seo-api.revrebel.io/api/url-scan/import \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_SEO_API_KEY" \
  --data-binary @scan-output.json
```

Example live Cloudflare submission through `seo-api`:

```bash
curl -X POST https://seo-api.revrebel.io/api/url-scan \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_SEO_API_KEY" \
  -d '{
    "url": "https://www.cloudflare.com",
    "provider": "cloudflare",
    "waitForResult": false
  }'
```

Example retrieval:

```bash
curl https://seo-api.revrebel.io/api/url-scan/YOUR_SCAN_ID \
  -H "x-api-key: YOUR_SEO_API_KEY"
```

Example raw retrieval:

```bash
curl "https://seo-api.revrebel.io/api/url-scan/YOUR_SCAN_ID?includeRaw=true" \
  -H "x-api-key: YOUR_SEO_API_KEY"
```

Example refresh:

```bash
curl -X POST https://seo-api.revrebel.io/api/url-scan/YOUR_SCAN_ID/refresh \
  -H "x-api-key: YOUR_SEO_API_KEY"
```

---

## What Gemini Should Not Do

Do not require Gemini to:

- Verify real Cloudflare credentials
- Submit real scans to Cloudflare
- Poll real Cloudflare results
- Test production `https://seo-api.revrebel.io`
- Validate DNS/Nginx/PM2 behavior
- Run live curl tests against external APIs

Those will be handled later in a separate Codex testing task.

Gemini should still write code that is testable and document the commands that Codex/manual testing should run later.

---

## Implementation Validation Gemini Can Do

Gemini may perform non-live checks such as:

```bash
node --check src/routes/url-scan.routes.js
node --check src/repositories/url-scan.repository.js
node --check src/url-scanner/cloudflare-scan-parser.js
node --check src/url-scanner/cloudflare-urlscanner-client.js
```

Gemini may also add parser unit tests using fixture JSON if the project already has a test setup.

If no test framework exists, Gemini should document manual parser checks but should not add a heavy testing framework unless needed.

---

## Deferred Codex Testing Task

A later Codex task should test:

```text
Cloudflare token works
Cloudflare scan submit endpoint works
Cloudflare result endpoint path is correct
waitForResult behavior works
refresh behavior works
raw_scan_json is populated from live Cloudflare result
production seo-api endpoint works
MCP tool calls work
Nginx routing works
PM2 process health works
```

Do not include those as acceptance criteria for this Gemini implementation task.

---

## Acceptance Criteria

This implementation task is complete when:

1. Migration files exist for `url_scans`.
2. Optional migration files exist for `url_scan_requests`, if implemented.
3. `POST /api/url-scan/import` exists.
4. Import endpoint stores full raw scanner payload.
5. `POST /api/url-scan` exists.
6. Cloudflare provider client module exists.
7. Cloudflare credentials are read from environment variables only.
8. Cloudflare bearer token is not exposed.
9. `GET /api/url-scan/:scanId` exists.
10. `includeRaw=true` behavior is implemented.
11. `GET /api/url-scans` exists.
12. `POST /api/url-scan/:scanId/refresh` exists.
13. Parser preserves unknown fields in `raw_scan_json`.
14. Parser builds lightweight summary JSON.
15. OpenAPI documents all scanner endpoints.
16. README documents scanner setup and deferred testing.
17. Existing `/api/audit` behavior is not intentionally changed.
18. Existing Postgres audit persistence is not intentionally changed.
19. No live external API testing is required from Gemini.
20. Code syntax checks pass for newly added files.

---

## Non-Goals

Do not build these in this task:

- Final curated reporting structure
- Dashboard/UI
- PDF reports
- Competitor benchmarking
- Scheduled scans
- Combined site-health endpoint
- Final scanner scoring model
- Production live API testing
- Codex testing scripts
- DNS/Nginx/PM2 validation
- OAuth or Google Workspace agent testing

---

## Final Instruction

Build the scanner capability as a durable raw-output capture system first.

Capture everything from the Cloudflare/API result output.

Store it in Postgres.

Extract only lightweight summary/index fields for lookup.

Do not curate away fields.

Do not require Gemini to live-test external APIs.

A separate Codex task will handle live testing later.
