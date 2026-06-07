# seo-api Addendum — Cloudflare URL Scanner Live API Authentication + Submission

## Project

**Project name:** `seo-api`  
**Backend URL:** `https://seo-api.revrebel.io`  
**Related task:** URL Scanner import / capture-everything task  
**Purpose of this addendum:** Add Cloudflare URL Scanner API credentials, live scan submission, result retrieval, and raw result capture.

---

## Why This Addendum Exists

The prior URL Scanner task focused on importing and storing an already-completed Cloudflare-style URL Scanner JSON result.

That is still useful, but it is incomplete.

The Cloudflare article/API example shows a live API submission flow using:

```bash
curl --request POST \
  --url https://api.cloudflare.com/client/v4/accounts/<accountId>/urlscanner/scan \
  --header 'Content-Type: application/json' \
  --header "Authorization: Bearer <API_TOKEN>" \
  --data '{
    "url": "https://www.cloudflare.com"
  }'
```

The `seo-api` implementation must support this credentialed Cloudflare API flow.

---

## Cloudflare API Authentication Requirement [COMPLETED]

Cloudflare URL Scanner API calls require a bearer token.

Add support for:

```env
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_URLSCANNER_API_TOKEN=
```

Optional:

```env
CLOUDFLARE_URLSCANNER_BASE_URL=https://api.cloudflare.com/client/v4
```

Do not expose these values through API responses, logs, MCP tool output, OpenAPI examples, or error payloads.

---

## Cloudflare Token Permission [COMPLETED]

Create a Cloudflare API token with URL Scanner permissions.

Required permission:

```text
Account > URL Scanner > Edit
```

The token should be scoped to the Cloudflare account used for URL Scanner access.

Do not use a global API key.

---

## Endpoint Version Note

Cloudflare examples may show more than one URL Scanner path depending on article date or API version.

Known examples include:

```text
/accounts/{accountId}/urlscanner/scan
/accounts/{accountId}/urlscanner/v2/scan
```

The implementation should centralize this path in one client module so it can be changed easily.

Preferred default:

```text
/accounts/{accountId}/urlscanner/v2/scan
```

But allow override through environment variable if needed:

```env
CLOUDFLARE_URLSCANNER_SCAN_PATH=/accounts/{accountId}/urlscanner/v2/scan
```

Also support result retrieval path:

```env
CLOUDFLARE_URLSCANNER_RESULT_PATH=/accounts/{accountId}/urlscanner/v2/result/{scanId}
```

---

## Required New Capability

Add live Cloudflare URL Scanner provider support.

New flow:

```text
POST /api/url-scan
  provider: "cloudflare"
  url: "https://example.com"

seo-api
  ↓
calls Cloudflare URL Scanner API with bearer token
  ↓
receives Cloudflare scan ID / response
  ↓
stores initial provider submission response
  ↓
retrieves/polls final scan result when available
  ↓
stores complete raw Cloudflare result in raw_scan_json
  ↓
returns seo-api scanId + provider scan ID
```

---

## New Environment Variables [COMPLETED]

Update `.env.example`:

```env
# Cloudflare URL Scanner
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_URLSCANNER_API_TOKEN=
CLOUDFLARE_URLSCANNER_BASE_URL=https://api.cloudflare.com/client/v4
CLOUDFLARE_URLSCANNER_SCAN_PATH=/accounts/{accountId}/urlscanner/v2/scan
CLOUDFLARE_URLSCANNER_RESULT_PATH=/accounts/{accountId}/urlscanner/v2/result/{scanId}
CLOUDFLARE_URLSCANNER_POLL_INTERVAL_MS=3000
CLOUDFLARE_URLSCANNER_POLL_TIMEOUT_MS=60000
```

---

## New Client Module

Create:

```text
src/url-scanner/cloudflare-urlscanner-client.js
```

Required exports:

```js
submitCloudflareUrlScan(payload);
getCloudflareUrlScanResult(providerScanId);
pollCloudflareUrlScanResult(providerScanId, options);
```

Recommended implementation shape:

```js
const BASE_URL =
  process.env.CLOUDFLARE_URLSCANNER_BASE_URL ||
  "https://api.cloudflare.com/client/v4";

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_URLSCANNER_API_TOKEN;

const SCAN_PATH_TEMPLATE =
  process.env.CLOUDFLARE_URLSCANNER_SCAN_PATH ||
  "/accounts/{accountId}/urlscanner/v2/scan";

const RESULT_PATH_TEMPLATE =
  process.env.CLOUDFLARE_URLSCANNER_RESULT_PATH ||
  "/accounts/{accountId}/urlscanner/v2/result/{scanId}";

function requireCloudflareConfig() {
  if (!ACCOUNT_ID) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID is not configured");
  }

  if (!API_TOKEN) {
    throw new Error("CLOUDFLARE_URLSCANNER_API_TOKEN is not configured");
  }
}

function buildPath(template, values) {
  return template
    .replace("{accountId}", encodeURIComponent(values.accountId))
    .replace("{scanId}", encodeURIComponent(values.scanId || ""));
}

async function cloudflareRequest(path, options = {}) {
  requireCloudflareConfig();

  const url = new URL(path, BASE_URL);

  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_TOKEN}`,
      ...(options.headers || {}),
    },
  });

  const body = await response.json().catch(() => null);

  if (!response.ok || body?.success === false) {
    return {
      success: false,
      statusCode: response.status,
      error: "Cloudflare URL Scanner request failed",
      details: body,
    };
  }

  return body;
}

export async function submitCloudflareUrlScan(payload) {
  const path = buildPath(SCAN_PATH_TEMPLATE, {
    accountId: ACCOUNT_ID,
  });

  return cloudflareRequest(path, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getCloudflareUrlScanResult(providerScanId) {
  const path = buildPath(RESULT_PATH_TEMPLATE, {
    accountId: ACCOUNT_ID,
    scanId: providerScanId,
  });

  return cloudflareRequest(path, {
    method: "GET",
  });
}

export async function pollCloudflareUrlScanResult(
  providerScanId,
  options = {},
) {
  const intervalMs =
    Number(options.intervalMs) ||
    Number(process.env.CLOUDFLARE_URLSCANNER_POLL_INTERVAL_MS) ||
    3000;

  const timeoutMs =
    Number(options.timeoutMs) ||
    Number(process.env.CLOUDFLARE_URLSCANNER_POLL_TIMEOUT_MS) ||
    60000;

  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const result = await getCloudflareUrlScanResult(providerScanId);

    if (result?.success === false) {
      return result;
    }

    const status =
      result?.result?.task?.status ||
      result?.task?.status ||
      result?.result?.status ||
      result?.status;

    if (status === "finished" || status === "completed") {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return {
    success: false,
    error: "Cloudflare URL Scanner result polling timed out",
    providerScanId,
  };
}
```

Important:

- Do not log `API_TOKEN`.
- Do not return `API_TOKEN`.
- Keep Cloudflare paths configurable because API examples may differ by version.

---

## New REST Endpoint Behavior

Update:

```http
POST /api/url-scan
```

Request body:

```json
{
  "url": "https://www.cloudflare.com",
  "provider": "cloudflare",
  "visibility": "unlisted",
  "waitForResult": true
}
```

Required fields:

```text
url
```

Optional fields:

```text
provider
visibility
waitForResult
customHeaders
country
```

Default:

```json
{
  "provider": "internal",
  "waitForResult": false
}
```

When `provider = "cloudflare"`:

1. Validate URL using existing secure URL validator.
2. Create local `url_scans` row with `source_provider = 'cloudflare'` and `scan_status = 'submitted'`.
3. Submit to Cloudflare URL Scanner API with bearer token.
4. Store Cloudflare submission response in `provider_submission_json`.
5. Extract Cloudflare provider scan ID.
6. If `waitForResult = false`, return local `scanId` and provider scan ID.
7. If `waitForResult = true`, poll Cloudflare result endpoint.
8. Store full final Cloudflare result in `raw_scan_json`.
9. Parse summary fields from final result.
10. Return compact summary.

---

## Database Schema Additions

Update `url_scans` table to support live provider submissions.

If `url_scans` already exists, create a new migration.

Add columns:

```sql
ALTER TABLE url_scans
ADD COLUMN IF NOT EXISTS provider_submission_json JSONB;

ALTER TABLE url_scans
ADD COLUMN IF NOT EXISTS provider_status TEXT;

ALTER TABLE url_scans
ADD COLUMN IF NOT EXISTS provider_error_json JSONB;

ALTER TABLE url_scans
ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;

ALTER TABLE url_scans
ADD COLUMN IF NOT EXISTS result_retrieved_at TIMESTAMPTZ;
```

If creating `url_scans` fresh, include these columns from the start:

```sql
provider_submission_json JSONB,
provider_status TEXT,
provider_error_json JSONB,
submitted_at TIMESTAMPTZ,
result_retrieved_at TIMESTAMPTZ
```

---

## Repository Updates

Update:

```text
src/repositories/url-scan.repository.js
```

Add exports:

```js
createCloudflareScanSubmissionStart(payload);
markCloudflareScanSubmitted(scanId, payload);
completeCloudflareScanFromResult(scanId, parsed);
failCloudflareScan(scanId, errorPayload);
```

Required stored values:

```text
local scan id
provider scan id
provider submission response
provider final result
provider status
error JSON if failure
timestamps
```

---

## Response Shapes

### `POST /api/url-scan` with `waitForResult = false`

```json
{
  "success": true,
  "scanId": "local-uuid",
  "sourceProvider": "cloudflare",
  "providerScanId": "cloudflare-scan-id",
  "status": "submitted",
  "message": "Cloudflare URL scan submitted. Retrieve the final result later."
}
```

### `POST /api/url-scan` with `waitForResult = true`

```json
{
  "success": true,
  "scanId": "local-uuid",
  "sourceProvider": "cloudflare",
  "providerScanId": "cloudflare-scan-id",
  "status": "completed",
  "summary": {},
  "result": {}
}
```

### Cloudflare auth/config failure

```json
{
  "success": false,
  "error": "Cloudflare URL Scanner is not configured",
  "message": "Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_URLSCANNER_API_TOKEN"
}
```

Do not expose token values.

---

## New Retrieval Behavior

Update:

```http
GET /api/url-scan/:scanId
```

If a scan was submitted to Cloudflare but final result is not stored yet, optionally support:

```http
POST /api/url-scan/:scanId/refresh
```

This endpoint should:

1. Look up the local scan.
2. Confirm `source_provider = 'cloudflare'`.
3. Confirm `source_scan_id` exists.
4. Fetch the final result from Cloudflare.
5. Store full result in `raw_scan_json`.
6. Update status and summary.
7. Return updated scan.

Add endpoint:

```http
POST /api/url-scan/:scanId/refresh
```

Operation ID:

```text
refreshUrlScanResult
```

---

## Cloudflare Submission Payload

Start with minimal payload:

```json
{
  "url": "https://www.cloudflare.com"
}
```

Allow optional fields only if Cloudflare API supports them in the current version.

Suggested wrapper from `seo-api` request to Cloudflare request:

```js
const cloudflarePayload = {
  url: validatedUrl,
};

if (visibility) {
  cloudflarePayload.visibility = visibility;
}

if (customHeaders) {
  cloudflarePayload.customHeaders = customHeaders;
}

if (country) {
  cloudflarePayload.country = country;
}
```

If optional fields are rejected by Cloudflare, fall back to minimal payload in this phase.

---

## OpenAPI Updates

Update:

```text
public/openapi.json
```

Add or update:

```text
POST /api/url-scan
POST /api/url-scan/import
GET /api/url-scan/{scanId}
GET /api/url-scans
POST /api/url-scan/{scanId}/refresh
```

Add fields to `POST /api/url-scan` request schema:

```text
url
provider
visibility
waitForResult
country
customHeaders
```

Make it clear:

```text
provider = internal | cloudflare
```

All `/api/*` endpoints require `x-api-key`.

Cloudflare bearer token is never supplied by the client. It is server-side only through environment variables.

---

## MCP Updates

Add MCP tool after REST endpoint works:

```text
run_cloudflare_url_scan
refresh_cloudflare_url_scan
```

### `run_cloudflare_url_scan`

Description:

```text
Submit a URL to Cloudflare URL Scanner through seo-api. Returns a local seo-api scanId and Cloudflare provider scan ID. Can optionally wait for the final result and store the complete raw Cloudflare output.
```

Input:

```json
{
  "url": "https://www.cloudflare.com",
  "waitForResult": true
}
```

### `refresh_cloudflare_url_scan`

Description:

```text
Refresh a previously submitted Cloudflare URL scan by retrieving the final result from Cloudflare and storing the complete raw output in seo-api.
```

Input:

```json
{
  "scanId": "local-uuid"
}
```

---

## README Updates

Add section:

```md
## Cloudflare URL Scanner Live API
```

Include:

- Required Cloudflare account ID
- Required Cloudflare API token
- Required token permission
- Environment variables
- Submit endpoint
- Refresh endpoint
- Raw result storage
- Example curl commands

Example:

```bash
curl -X POST https://seo-api.revrebel.io/api/url-scan \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_SEO_API_KEY" \
  -d '{
    "url": "https://www.cloudflare.com",
    "provider": "cloudflare",
    "waitForResult": true
  }'
```

Clarify:

```text
The client calls seo-api with x-api-key.
seo-api calls Cloudflare with Authorization: Bearer CLOUDFLARE_URLSCANNER_API_TOKEN.
The Cloudflare token is never sent to external clients or agents.
```

---

## Acceptance Criteria

This addendum is complete when:

1. `.env.example` includes Cloudflare URL Scanner variables.
2. Cloudflare bearer token is read only from server environment variables.
3. `cloudflare-urlscanner-client.js` exists.
4. Direct Cloudflare submission works from `seo-api`.
5. `POST /api/url-scan` supports `provider = cloudflare`.
6. Submitted Cloudflare scans create local `url_scans` rows.
7. Cloudflare provider scan ID is stored.
8. Cloudflare submission response is stored.
9. Final Cloudflare result can be retrieved/polled.
10. Full final Cloudflare result is stored in `raw_scan_json`.
11. `POST /api/url-scan/:scanId/refresh` can retrieve a final result later.
12. OpenAPI documents the new behavior.
13. README documents Cloudflare token setup and curl examples.
14. No Cloudflare token values are logged or returned.
15. Existing import endpoint still works.
16. Existing SEO audit endpoint still works.

---

## Final Instruction

The previous task captures already-completed scanner JSON.

This addendum adds live Cloudflare URL Scanner API submission using:

```http
Authorization: Bearer <API_TOKEN>
```

Keep Cloudflare credentials server-side only. Store the full Cloudflare result output when available. Curate later.
