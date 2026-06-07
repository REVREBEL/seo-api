# SEO-API

## Overview

A lightweight Node.js API for auditing websites for technical SEO, structured data, hotel commercial signals, and performance metrics. Designed to run on an Ubuntu server and integrate with AI agents via an OpenAPI specification.

---

## Requirements

- **Node.js** v18 or higher (v22 recommended)
- **npm** v9+
- **Playwright Chromium** (installed separately — see below)

---

## Environment Variables

Copy the example file and configure your environment:

```bash
cp .env.example .env
```

| Variable           | Required         | Description                                     |
| ------------------ | ---------------- | ----------------------------------------------- |
| `REVREBEL_API_KEY` | Yes (production) | API key required for `/api/*` routes            |
| `PORT`             | No               | Server port. Defaults to `3000`                 |
| `NODE_ENV`         | No               | Set to `production` for hardened startup checks |
| `DATABASE_URL`     | No               | Connection string for Postgres database         |

> **Note:** In development, if `REVREBEL_API_KEY` is not set, the fallback key `rebel-default-development-key` is used automatically. In production, the server will refuse to start without an explicit key.

---

## Install

```bash
npm install
```

---

## Install Playwright Browser Dependencies

```bash
npx playwright install --with-deps chromium
```

This installs Chromium and all required system libraries for headless browser rendering.

---

## Run Locally

```bash
npm start
```

The API will start on `http://localhost:3000`.

---

## Health Check

Verify the server is running:

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{
  "status": "UP",
  "timestamp": "2026-06-04T00:00:00.000Z"
}
```

---

## OpenAPI Spec

The OpenAPI specification is served as a static file and does not require an API key:

```bash
curl http://localhost:3000/openapi.json
```

---

## Static Audit Test

> **Development key notice:** The key `rebel-default-development-key` used in the curl examples below is a well-known development fallback — it is **not a secret**. It is only active when `NODE_ENV` is not `production`. In production you must set `REVREBEL_API_KEY` to a strong, private value.

Run a static HTML audit (no browser rendering):

```bash
curl -X POST http://localhost:3000/api/audit \
  -H "Content-Type: application/json" \
  -H "x-api-key: rebel-default-development-key" \
  -d '{"url":"https://example.com","renderMode":"static"}'
```

---

## Browser Audit Test

Run a full browser-rendered audit using Playwright:

```bash
curl -X POST http://localhost:3000/api/audit \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
  -d '{"url":"https://example.com","renderMode":"browser","viewport":"desktop"}'
```

---

## Unauthorized Request Test

Requests without a valid API key should return `401 Unauthorized`:

```bash
curl -X POST http://localhost:3000/api/audit
  -H "Content-Type: application/json"
  -d '{"url":"https://example.com"}'
```

Expected response:

```json
{
  "success": false,
  "error": "Unauthorized: Missing or invalid x-api-key."
}
```

---

## Audit Request Body

| Field                  | Type      | Default     | Description                                                |
| ---------------------- | --------- | ----------- | ---------------------------------------------------------- |
| `url`                  | `string`  | _required_  | The URL to audit                                           |
| `renderMode`           | `string`  | `"static"`  | `"static"` or `"browser"`                                  |
| `includePerformance`   | `boolean` | `false`     | Run Lighthouse performance audit (slower)                  |
| `includeAccessibility` | `boolean` | `false`     | Run axe-core accessibility audit (requires browser mode)   |
| `viewport`             | `string`  | `"desktop"` | `"desktop"`, `"tablet"`, or `"mobile"` (browser mode only) |

---

## Postgres Persistence

The API can persist audit runs to a Postgres database.

### Database Setup

1.  **Create Database and User**

    ```sql
    CREATE DATABASE seoapi_db;
    CREATE USER seoapi WITH PASSWORD 'replace-with-secure-password';
    GRANT ALL PRIVILEGES ON DATABASE seoapi TO seoapi_db;
    \c seo_api
    GRANT ALL ON SCHEMA public TO seoapi;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO seoapi;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO seoapi;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO seoapi;
    ```

2.  **Set Environment Variable**

    Update your `.env` file:

    ```env
    DATABASE_URL=postgresql://seo_api_user:REPLACE_WITH_PASSWORD@localhost:5432/seo_api
    ```

### Run Migrations

Run the following command from the project root to create the necessary tables:

```bash
npm run db:migrate
```

### API Usage

- **Create Audit**

  ```bash
  curl -X POST https://seo-api.revrebel.io/api/audit \
    -H "Content-Type: application/json" \
    -H "x-api-key: your-api-key" \
    -d '{"url":"https://example.com","renderMode":"static"}'
  ```

- **Retrieve Audit**

  ```bash
  curl https://seo-api.revrebel.io/api/audit/YOUR_AUDIT_ID \
    -H "x-api-key: your-api-key"
  ```

- **List Audits**

  ```bash
  curl "https://seo-api.revrebel.io/api/audits?domain=example.com&limit=10" \
    -H "x-api-key: your-api-key"
  ```

---

## PM2 Deployment

Install PM2 globally and start the service:

```bash
npm install -g pm2
pm2 start src/index.js --name seo-api --interpreter node
pm2 save
pm2 startup
```

---

## Nginx Reverse Proxy

Example Nginx config (`/etc/nginx/sites-available/healthcheck`):

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/healthcheck /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## Production Notes

- Set `NODE_ENV=production` in your environment.
- `SEO_API_KEY` is **required** in production — the server will exit on startup if missing.
- Use HTTPS in production via Nginx with Let's Encrypt (`certbot`).
- Playwright's Chromium process is a singleton per server instance — it is shared across requests and gracefully closed on SIGTERM/SIGINT.
- The `/health` and `/openapi.json` endpoints are public and do not require an API key.

---

## MCP Server

This project includes an MCP (Model-Context-Protocol) server to expose the SEO audit capabilities to compatible AI agents, such as Google Workspace agents.

The MCP server acts as a wrapper around the existing REST API.

### MCP Endpoint

- **URL:** `https://seo-api.revrebel.io/mcp`

### Environment Variables

The following environment variables are used to configure the MCP server:

| Variable            | Required | Description                                                         |
| ------------------- | -------- | ------------------------------------------------------------------- |
| `SEO_API_BASE_URL`  | No       | Base URL of the REST API. Defaults to `https://seo-api.revrebel.io` |
| `SEO_API_KEY`       | Yes      | API key for the REST API.                                           |
| `MCP_SERVER_PORT`   | No       | Port for the MCP server. Defaults to `3010`.                        |
| `MCP_SHARED_SECRET` | No       | Optional secret for the MCP endpoint.                               |

### PM2 Process

The MCP server runs as a separate process managed by PM2. The `ecosystem.config.cjs` file is configured to run both the `seo-api` and `seo-api-mcp` processes.

- **Start both processes:** `pm2 restart ecosystem.config.cjs`
- **Check status:** `pm2 status`
- **View logs:** `pm2 logs seo-api-mcp`

### Nginx Proxy

Nginx is configured to proxy requests to the `/mcp` path to the MCP server running on port `3010`.

### MCP Tools

The MCP server exposes the following tools:

- `audit_seo_page`: Run a new SEO audit for a URL.
- `get_audit_run`: Retrieve a prior audit execution by ID.
- `list_audit_runs`: List recent audit executions.

### MCP Inspector Testing

Use the MCP Inspector to test the MCP endpoint and tools.

1.  **Run the inspector:**

    ```bash
    npx @modelcontextprotocol/inspector
    ```

2.  **Connect to the MCP endpoint:**
    - **Local:** `http://127.0.0.1:3010/mcp`
    - **Public:** `https://seo-api.revrebel.io/mcp`

### Health Check

You can check the health of the MCP server by sending a GET request to `/health`. Note that this is on the MCP server port, not the main API port.

```bash
curl http://localhost:3010/health
```

When running behind the Nginx proxy, you can also test the public health endpoint for the main API and the MCP endpoint (if you configure a health check route for it in nginx).

```bash
curl https://seo-api.revrebel.io/health
curl https://seo-api.revrebel.io/mcp/health # This will not work with the current nginx config
```

Note that the `/mcp` endpoint itself will not provide a meaningful response in a browser. Use the MCP Inspector for testing.
