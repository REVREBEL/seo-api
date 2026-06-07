# seo-api Phase 2B Work Order — MCP Server Wrapper for Google Workspace Agent Integration

## Project

**Project name:** `seo-api`  
**Backend URL:** `https://seo-api.revrebel.io`  
**Current API style:** REST / JSON over HTTPS  
**New integration requirement:** Google Workspace agent must connect through MCP  
**Runtime:** Node.js / Express  
**Process manager:** PM2  
**Frontend/reverse proxy:** Nginx  
**Node manager:** Volta  
**Persistence layer:** Postgres, added in Phase 2A or in progress

## Mission

Build an MCP server layer for `seo-api` so Google Workspace agents and other MCP-compatible clients can call the SEO audit backend through MCP tools.

The goal is not to replace the existing REST API. The goal is to expose the existing REST capabilities as MCP tools.

The MCP layer should be thin, reliable, and explicit.

It should wrap these existing or planned API capabilities:

- Run a new SEO audit
- Retrieve a prior audit by `auditId`
- List recent audits for a domain
- Optionally expose benchmark/compare tools later

---

## Important Context

The existing backend is available at:

```text
https://seo-api.revrebel.io
```

The existing REST API includes or will include:

```http
POST /api/audit
GET  /api/audit/:auditId
GET  /api/audits?domain=example.com&limit=10
```

All `/api/*` REST endpoints require:

```http
x-api-key: YOUR_SECRET_KEY
```

The MCP server should call the existing REST API internally rather than duplicating the audit logic.

---

## Preferred Architecture

Use a separate MCP server wrapper process.

```text
Google Workspace Agent / MCP Client
  ↓
MCP Server
  ↓
Calls existing REST API at https://seo-api.revrebel.io
  ↓
seo-api Express backend
  ↓
Postgres persistence
```

This keeps the existing `seo-api` backend clean and avoids mixing protocol concerns into the main audit server.

---

## Transport Requirement

Implement a remote HTTP-capable MCP server.

Do not build only a local stdio MCP server unless explicitly needed for local testing.

For production, the MCP server should be reachable over HTTPS through Nginx, for example:

```text
https://seo-api.revrebel.io/mcp
```

---

## Recommended Package [COMPLETED]

The official MCP SDK and Zod infrastructure have been manually provisioned in the workspace to prevent process locks:

- `@modelcontextprotocol/sdk` (Installed)
- `zod` (Installed)

### Code Generation Rules:

- Use `zod` for all tool input schemas.
- Implement the current recommended **Streamable HTTP server pattern** for the remote server architecture.
- Do not drop back to legacy, dual-endpoint SSE transport samples unless explicitly required.

---

## Environment Variables [COMPLETED]

Add to `.env.example` and production `.env` as needed:

```env
SEO_API_BASE_URL=https://seo-api.revrebel.io
SEO_API_KEY=replace-with-existing-seo-api-key
MCP_SERVER_PORT=3010
MCP_SHARED_SECRET=replace-with-optional-mcp-secret
NODE_ENV=production
```

Notes:

- `SEO_API_BASE_URL` is the REST API base URL.
- `SEO_API_KEY` is used by the MCP server when calling REST endpoints.
- `MCP_SERVER_PORT` is the internal port the MCP server listens on.
- `MCP_SHARED_SECRET` is optional but recommended if the MCP endpoint is publicly reachable.
- If Google Workspace requires its own auth method, adapt this layer accordingly.

---

## New Files To Add [COMPLETED]

Add:

```text
src/mcp/
  server.js
  seo-api-client.js
  tools/
    audit-seo-page.tool.js
    get-audit-run.tool.js
    list-audit-runs.tool.js
```

Update:

```text
README.md
.env.example
ecosystem.config.cjs
package.json
```

Optional:

```text
docs/mcp-google-workspace-setup.md
```

---

## Required MCP Tools

### Tool 1 — `audit_seo_page`

Purpose:

Run a new SEO audit for a URL.

This wraps:

```http
POST /api/audit
```

Input schema:

```json
{
  "url": "https://example.com",
  "renderMode": "static",
  "includePerformance": false,
  "includeAccessibility": false,
  "viewport": "desktop"
}
```

Input fields:

| Field                  | Type    | Required | Default   | Notes                                  |
| ---------------------- | ------- | -------: | --------- | -------------------------------------- |
| `url`                  | string  |      yes | none      | Must be a valid HTTP/HTTPS URL         |
| `renderMode`           | string  |       no | `static`  | Allowed: `static`, `browser`           |
| `includePerformance`   | boolean |       no | `false`   | Optional Lighthouse/performance mode   |
| `includeAccessibility` | boolean |       no | `false`   | Optional accessibility mode            |
| `viewport`             | string  |       no | `desktop` | Allowed: `desktop`, `tablet`, `mobile` |

Output:

Return the REST API response from `POST /api/audit`, including:

```json
{
  "success": true,
  "auditId": "uuid",
  "targetUrl": "https://example.com/",
  "status": "completed",
  "result": {}
}
```

If the REST API fails, return a structured MCP tool error payload, not an unhandled exception.

---

### Tool 2 — `get_audit_run`

Purpose:

Retrieve a prior audit execution by ID.

This wraps:

```http
GET /api/audit/:auditId
```

Input schema:

```json
{
  "auditId": "uuid"
}
```

Input fields:

| Field     | Type   | Required | Notes                             |
| --------- | ------ | -------: | --------------------------------- |
| `auditId` | string |      yes | UUID returned by `audit_seo_page` |

Output:

Return the stored audit execution:

```json
{
  "success": true,
  "audit": {
    "auditId": "uuid",
    "targetUrl": "https://example.com/",
    "domain": "example.com",
    "status": "completed",
    "request": {},
    "result": {},
    "scores": {}
  }
}
```

---

### Tool 3 — `list_audit_runs`

Purpose:

List recent audit executions, optionally filtered by domain.

This wraps:

```http
GET /api/audits?domain=example.com&limit=10
```

Input schema:

```json
{
  "domain": "example.com",
  "limit": 10,
  "offset": 0
}
```

Input fields:

| Field    | Type   | Required | Default | Notes                  |
| -------- | ------ | -------: | ------- | ---------------------- |
| `domain` | string |       no | none    | Optional domain filter |
| `limit`  | number |       no | `10`    | Max should be 100      |
| `offset` | number |       no | `0`     | Pagination offset      |

Output:

```json
{
  "success": true,
  "domain": "example.com",
  "count": 10,
  "audits": []
}
```

---

## Future MCP Tools, Not In This Phase

Do not build these yet unless the required REST endpoints already exist:

```text
compare_audit_runs
benchmark_domain
benchmark_competitor_set
schedule_audit
crawl_sitemap
generate_report
```

For now, expose only:

```text
audit_seo_page
get_audit_run
list_audit_runs
```

---

## REST Client Module [COMPLETED]

Create:

```text
src/mcp/seo-api-client.js
```

It should centralize calls to the existing REST API.

Recommended shape:

```js
const SEO_API_BASE_URL =
  process.env.SEO_API_BASE_URL || "https://seo-api.revrebel.io";
const SEO_API_KEY = process.env.SEO_API_KEY;

if (!SEO_API_KEY) {
  console.warn("SEO_API_KEY is not set. MCP calls to seo-api will fail.");
}

async function requestJson(path, options = {}) {
  const url = new URL(path, SEO_API_BASE_URL);

  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": SEO_API_KEY,
      ...(options.headers || {}),
    },
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    return {
      success: false,
      statusCode: response.status,
      error: body?.error || "seo-api request failed",
      message: body?.message || null,
      details: body,
    };
  }

  return body;
}

export async function auditSeoPage(payload) {
  return requestJson("/api/audit", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getAuditRun(auditId) {
  return requestJson(`/api/audit/${encodeURIComponent(auditId)}`, {
    method: "GET",
  });
}

export async function listAuditRuns({ domain, limit = 10, offset = 0 } = {}) {
  const params = new URLSearchParams();

  if (domain) params.set("domain", domain);
  if (limit) params.set("limit", String(limit));
  if (offset) params.set("offset", String(offset));

  const query = params.toString();
  const path = query ? `/api/audits?${query}` : "/api/audits";

  return requestJson(path, {
    method: "GET",
  });
}
```

---

## MCP Server Implementation Requirements [COMPLETED]

Create:

```text
src/mcp/server.js
```

The server should:

1. Create an MCP server.
2. Register the three tools.
3. Validate inputs using schemas.
4. Call the REST client module.
5. Return JSON text content or structured content in a way the MCP client can consume.
6. Listen on `MCP_SERVER_PORT`, default `3010`.
7. Expose the MCP endpoint at `/mcp`.
8. Optionally expose `/health` for the MCP wrapper.

### Required Health Endpoint [COMPLETED]

Expose:

```http
GET /health
```

Return:

```json
{
  "status": "UP",
  "service": "seo-api-mcp",
  "timestamp": "2026-06-06T00:00:00.000Z"
}
```

This health endpoint is for Nginx/PM2 testing and does not need to be MCP protocol-aware.

---

## Authentication For MCP Endpoint [COMPLETED]

If the MCP client supports custom headers, require:

```http
x-mcp-secret: YOUR_MCP_SHARED_SECRET
```

If Google Workspace MCP configuration cannot send custom headers, do not block the MCP endpoint with this header. Instead, rely on:

- HTTPS
- DNS/private route restrictions where possible
- The MCP server using `SEO_API_KEY` internally when calling the REST API
- Nginx allowlist or access controls if practical

The MCP server must never expose `SEO_API_KEY` to the client.

---

## PM2 Process [COMPLETED]

Add a second PM2 app entry or a separate ecosystem config.

Preferred: same `ecosystem.config.cjs` with two apps:

```js
const path = require("path");

module.exports = {
  apps: [
    {
      name: "seo-api",
      script: path.join(__dirname, "src/index.js"),
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
    {
      name: "seo-api-mcp",
      script: path.join(__dirname, "src/mcp/server.js"),
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      watch: false,
      env: {
        NODE_ENV: "production",
        MCP_SERVER_PORT: 3010,
      },
    },
  ],
};
```

Restart:

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 status
```

If `seo-api` is already running, use:

```bash
pm2 restart ecosystem.config.cjs
pm2 save
```

---

## Nginx Routing [COMPLETED]

The existing public backend URL is:

```text
https://seo-api.revrebel.io
```

Current REST API routes should continue to proxy to Node app on port `3000`.

Add MCP route proxying to port `3010`.

Recommended Nginx location block:

```nginx
location /mcp {
    proxy_pass http://127.0.0.1:3010/mcp;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_connect_timeout 120;
    proxy_send_timeout 120;
    proxy_read_timeout 120;

    proxy_buffering off;
}
```

If the MCP implementation uses Server-Sent Events or streaming responses, `proxy_buffering off;` is important.

Keep the existing root/API proxy to port `3000`.

Example combined Nginx server:

```nginx
server {
    listen 80;
    server_name seo-api.revrebel.io;

    client_max_body_size 2m;

    location /mcp {
        proxy_pass http://127.0.0.1:3010/mcp;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 120;
        proxy_send_timeout 120;
        proxy_read_timeout 120;

        proxy_buffering off;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 120;
        proxy_send_timeout 120;
        proxy_read_timeout 120;
    }
}
```

If Certbot has already created the HTTPS server block, edit the existing HTTPS block rather than replacing it blindly.

After editing:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## Local Testing

### Start MCP Server Locally

```bash
MCP_SERVER_PORT=3010 \
SEO_API_BASE_URL=https://seo-api.revrebel.io \
SEO_API_KEY=YOUR_SECRET_KEY \
node src/mcp/server.js
```

Test health:

```bash
curl http://127.0.0.1:3010/health
```

If the MCP endpoint supports basic HTTP POST inspection, test with the MCP Inspector instead of raw curl.

---

## MCP Inspector Testing

Install/run the MCP inspector according to the current MCP SDK guidance.

Example style:

```bash
npx @modelcontextprotocol/inspector
```

Connect to:

```text
http://127.0.0.1:3010/mcp
```

or public:

```text
https://seo-api.revrebel.io/mcp
```

Confirm that the following tools are visible:

```text
audit_seo_page
get_audit_run
list_audit_runs
```

Test `audit_seo_page` with:

```json
{
  "url": "https://example.com",
  "renderMode": "static",
  "includePerformance": false,
  "includeAccessibility": false,
  "viewport": "desktop"
}
```

Then test `get_audit_run` with the returned `auditId`.

Then test `list_audit_runs` with:

```json
{
  "domain": "example.com",
  "limit": 10
}
```

---

## Google Workspace Agent Configuration Notes

The Google Workspace agent should connect to the MCP endpoint:

```text
https://seo-api.revrebel.io/mcp
```

Expose these tools:

```text
audit_seo_page
get_audit_run
list_audit_runs
```

Tool descriptions should make the intended sequence clear:

1. Use `audit_seo_page` to run a new audit.
2. Save the returned `auditId`.
3. Use `get_audit_run` if the agent needs to recover a previous execution.
4. Use `list_audit_runs` to find recent audits for a domain.
5. Do not rerun audits unnecessarily if a recent matching audit exists.

---

## Tool Description Guidance

### `audit_seo_page`

Suggested description:

```text
Run a website SEO and hotel-commercial health audit for a single URL. Returns a persistent auditId and structured audit result. Use this when a user asks to audit a website, inspect a hotel site, or generate SEO health data for a specific page.
```

### `get_audit_run`

Suggested description:

```text
Retrieve a previously completed or failed SEO audit execution by auditId. Use this to recover prior work, continue after a disconnected session, or reference a specific previous audit result.
```

### `list_audit_runs`

Suggested description:

```text
List recent SEO audit executions, optionally filtered by domain. Use this before rerunning an audit if the user asks about prior audits, benchmarking, trends, or recent results for a site.
```

---

## Error Handling Requirements

All MCP tools should return structured, readable errors.

Examples:

### REST API unavailable

```json
{
  "success": false,
  "error": "seo-api unavailable",
  "message": "Unable to reach https://seo-api.revrebel.io"
}
```

### Unauthorized internal REST call

```json
{
  "success": false,
  "error": "seo-api authorization failed",
  "message": "Check SEO_API_KEY on the MCP server."
}
```

### Invalid tool input

```json
{
  "success": false,
  "error": "Invalid input",
  "message": "url is required and must be a valid HTTP or HTTPS URL."
}
```

Do not leak environment variables or API keys in error messages.

---

## README Updates

Add a section:

```md
## MCP Server
```

Include:

- What the MCP server does
- MCP endpoint URL
- Environment variables
- PM2 process name
- Nginx `/mcp` proxy
- Tool list
- MCP Inspector testing instructions
- Google Workspace agent setup notes

Include these commands:

```bash
npm install @modelcontextprotocol/sdk zod
```

```bash
pm2 restart ecosystem.config.cjs
pm2 status
pm2 logs seo-api-mcp
```

```bash
curl https://seo-api.revrebel.io/health
curl https://seo-api.revrebel.io/mcp
```

Note: `/mcp` may not produce a normal browser-friendly response. Use MCP Inspector for protocol testing.

---

## OpenAPI Note

OpenAPI remains useful for REST API documentation, but the Google Workspace agent requirement is now MCP.

Do not remove:

```text
public/openapi.json
```

Keep it available at:

```text
https://seo-api.revrebel.io/openapi.json
```

But MCP clients should connect to:

```text
https://seo-api.revrebel.io/mcp
```

---

## Acceptance Criteria

This phase is complete when:

1. Existing REST API still works.
2. Existing Postgres persistence still works, if Phase 2A is already implemented.
3. MCP SDK dependency is installed.
4. MCP server starts locally.
5. MCP server exposes a health endpoint.
6. MCP server exposes `/mcp`.
7. MCP server registers `audit_seo_page`.
8. MCP server registers `get_audit_run`.
9. MCP server registers `list_audit_runs`.
10. `audit_seo_page` successfully calls `POST /api/audit`.
11. `get_audit_run` successfully calls `GET /api/audit/:auditId`.
12. `list_audit_runs` successfully calls `GET /api/audits`.
13. PM2 runs both `seo-api` and `seo-api-mcp`.
14. Nginx proxies `/mcp` to the MCP server.
15. MCP Inspector can see and test all three tools.
16. README documents the MCP setup.
17. No REST audit logic was duplicated inside the MCP server.
18. No secrets are exposed in responses or logs.

---

## Non-Goals

Do not build these in this phase:

- New audit scoring
- New crawl mode
- New reporting UI
- New database tables unless strictly required
- OAuth for Google Workspace unless required by the MCP client configuration
- Multi-user permissioning
- Separate admin dashboard
- PDF generation
- Competitor benchmark tools

---

## Final Instruction

Build the MCP layer as a wrapper, not a replacement.

The existing `seo-api` REST backend remains the system of record.

The MCP server exists only to make those capabilities available to Google Workspace agents and other MCP-compatible clients.
