<p align="left">
	<picture>
		<source
			media="(prefers-color-scheme: dark)"
			srcset=".github/assets/readme-banner_dark.jpg"
		/>
		<img
			src=".github/assets/readme-banner_light.jpg"
			alt="seo-api repository banner"
		/>
	</picture>
</p>

<p align="right">seo-api a project by REVREBEL</p>

# SEO API

<div align="left">
	<a href="https://github.com/REVREBEL/seo-api/issues">
		<img src="https://img.shields.io/github/issues/REVREBEL/seo-api?color=163666&style=for-the-badge&logo=github" alt="Issues"/>
	</a>
	<a href="https://github.com/REVREBEL/seo-api/pulls">
		<img src="https://img.shields.io/github/issues-pr/REVREBEL/seo-api?color=71c9c5&style=for-the-badge&logo=github" alt="PRs"/>
	</a>
</div>

<br>
<br>

## **THE PROJECT**

A lightweight Node.js API for auditing websites for technical SEO, structured data, hotel commercial signals, and performance metrics. Designed to run on an Ubuntu server and integrate with AI agents via an OpenAPI specification.

---
<br>
<br>

## REQUIREMENTS

- **Node.js** v18 or higher (v22 recommended)
- **npm** v9+
- **Playwright Chromium** (installed separately — see below)

---
<br>
<br>

## Environment Variables

Copy the example file and configure your environment:

```bash
cp .env.example .env
```

| Variable       | Required         | Description                                     |
| -------------- | ---------------- | ----------------------------------------------- |
| `SEO_API_KEY`  | Yes (production) | API key required for `/api/*` routes            |
| `PORT`         | No               | Server port. Defaults to `3000`                 |
| `NODE_ENV`     | No               | Set to `production` for hardened startup checks |
| `DATABASE_URL` | No               | Connection string for Postgres database         |

> **Note:** In development, if `SEO_API_KEY` is not set, the fallback key `rebel-default-development-key` is used automatically. In production, the server will refuse to start without an explicit key.

---
<br>
<br>

## **INSTALLATION**

```bash
npm install
```

---
<br>
<br>

## Install Playwright Browser Dependencies

```bash
npx playwright install --with-deps chromium
```

This installs Chromium and all required system libraries for headless browser rendering.

---
<br>
<br>

## Run Locally

```bash
npm start
```

The API will start on `http://localhost:3000`.

---
<br>
<br>

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
<br>
<br>

## OpenAPI Spec

The OpenAPI specification is served as a static file and does not require an API key:

```bash
curl http://localhost:3000/openapi.json
```

---
<br>
<br>

## Static Audit Test

> **Development key notice:** The key `rebel-default-development-key` used in the curl examples below is a well-known development fallback — it is **not a secret**. It is only active when `NODE_ENV` is not `production`. In production you must set `SEO_API_KEY` to a strong, private value.

Run a static HTML audit (no browser rendering):

```bash
curl -X POST http://localhost:3000/api/audit \
  -H "Content-Type: application/json" \
  -H "x-api-key: rebel-default-development-key" \
  -d '{"url":"https://example.com","renderMode":"static"}'
```

---
<br>
<br>

## Browser Audit Test

Run a full browser-rendered audit using Playwright:

```bash
curl -X POST http://localhost:3000/api/audit \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key" \
  -d '{"url":"https://example.com","renderMode":"browser","viewport":"desktop"}'
```

---
<br>
<br>

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
<br>
<br>

## Audit Request Body

| Field                  | Type      | Default     | Description                                                |
| ---------------------- | --------- | ----------- | ---------------------------------------------------------- |
| `url`                  | `string`  | _required_  | The URL to audit                                           |
| `renderMode`           | `string`  | `"static"`  | `"static"` or `"browser"`                                  |
| `includePerformance`   | `boolean` | `false`     | Run Lighthouse performance audit (slower)                  |
| `includeAccessibility` | `boolean` | `false`     | Run axe-core accessibility audit (requires browser mode)   |
| `viewport`             | `string`  | `"desktop"` | `"desktop"`, `"tablet"`, or `"mobile"` (browser mode only) |

---
<br>
<br>

## Postgres Persistence

The API can persist audit runs to a Postgres database.

### Database Setup

1.  **Create Database and User**

    ```sql
    CREATE DATABASE seoapi_db;
    CREATE USER seoapi_user WITH PASSWORD 'replace-with-secure-password';
    GRANT ALL PRIVILEGES ON DATABASE seoapi_db TO seoapi_user;
    \c seoapi_db

    GRANT ALL ON SCHEMA public TO seoapi_user;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO seoapi_user;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO seoapi_user;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO seoapi_user;
    ```

2.  **Set Environment Variable**

    Update your `.env` file:

    ```env
    DATABASE_URL=postgresql://seoapi_user:REPLACE_WITH_PASSWORD@localhost:5432/seoapi_db

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
<br>
<br>


## PRODUCTION NOTES

- Set `NODE_ENV=production` in your environment.
- `SEO_API_KEY` is **required** in production — the server will exit on startup if missing.
- Use HTTPS in production via Nginx with Let's Encrypt (`certbot`).
- Playwright's Chromium process is a singleton per server instance — it is shared across requests and gracefully closed on SIGTERM/SIGINT.
- The `/health` and `/openapi.json` endpoints are public and do not require an API key.

---
<br>
<br>

## MCP SERVER

This project includes an MCP (Model-Context-Protocol) server to expose the SEO audit capabilities to compatible AI agents, such as Google Workspace agents.

The MCP server acts as a wrapper around the existing REST API.

### MCP ENDPOINT

- **URL:** `https://seo-api.revrebel.io/mcp`

### Environment Variables

The following environment variables are used to configure the MCP server:

| Variable            | Required | Description                                                         |
| ------------------- | -------- | ------------------------------------------------------------------- |
| `SEO_API_BASE_URL`  | No       | Base URL of the REST API. Defaults to `https://seo-api.revrebel.io` |
| `SEO_API_KEY`       | Yes      | API key for the REST API.                                           |
| `MCP_SERVER_PORT`   | No       | Port for the MCP server. Defaults to `3010`.                        |
| `MCP_SHARED_SECRET` | No       | Optional secret for the MCP endpoint.                               |

### PM2 PROCESS

The MCP server runs as a separate process managed by PM2. The `ecosystem.config.cjs` file is configured to run both the `seo-api` and `seo-api-mcp` processes.

- **Start both processes:** `pm2 restart ecosystem.config.cjs`
- **Check status:** `pm2 status`
- **View logs:** `pm2 logs seo-api-mcp`

### NGINX PROXY

Nginx is configured to proxy requests to the `/mcp` path to the MCP server running on port `3010`.

Example Nginx config (`/etc/nginx/sites-available/nginx_seo-api.conf`):

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # MCP Server Proxy
    location /mcp {
        proxy_pass http://127.0.0.1:3010/mcp;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off; # Important for streaming responses
    }

    # Main API Proxy
    location / {
        proxy_pass http://127.0.0.1:3000;
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
sudo ln -s /etc/nginx/sites-available/nginx_seo-api.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---


### MCP TOOLS

The MCP server exposes the following tools:

- `audit_seo_page`: Run a new SEO audit for a URL.
- `get_audit_run`: Retrieve a prior audit execution by ID.
- `list_audit_runs`: List recent audit executions.
- `import_url_scan`: Import a completed raw URL scanner payload and preserve the raw result.
- `run_url_scan`: Run a new provider-backed URL scanner request.
- `get_url_scan`: Retrieve a stored URL scanner result by scan ID, optionally including raw payloads and request rows.
- `list_url_scans`: List stored URL scanner results with compact summaries.
- `refresh_url_scan_result`: Refresh a provider-backed URL scanner result and store the final raw payload.

The scanner tools wrap the existing REST endpoints:

- `POST /api/url-scan/import`
- `POST /api/url-scan`
- `GET /api/url-scan/:scanId`
- `GET /api/url-scans`
- `POST /api/url-scan/:scanId/refresh`

### MCP INSPECTOR TESTING

Use the MCP Inspector to test the MCP endpoint and tools.

1.  **Run the inspector:**

    ```bash
    npx @modelcontextprotocol/inspector
    ```

2.  **Connect to the MCP endpoint:**
    - **Local:** `http://127.0.0.1:3010/mcp`
    - **Public:** `https://seo-api.revrebel.io/mcp`
    - If `MCP_SHARED_SECRET` is configured, include the `x-mcp-secret` header.

3.  **Validate the tool list includes all eight tools:**
    - `audit_seo_page`
    - `get_audit_run`
    - `list_audit_runs`
    - `import_url_scan`
    - `run_url_scan`
    - `get_url_scan`
    - `list_url_scans`
    - `refresh_url_scan_result`

### HEALTH CHECK

You can check the health of the MCP server by sending a GET request to `/health`. Note that this is on the MCP server port, not the main API port.

```bash
curl http://localhost:3010/health
```

When running behind the Nginx proxy, you can also test the public health endpoint for the main API and the MCP endpoint (if you configure a health check route for it in Nginx).

```bash
curl https://seo-api.revrebel.io/health
curl https://seo-api.revrebel.io/mcp/health # This will not work with the current nginx config
```

Note that the `/mcp` endpoint itself will not provide a meaningful response in a browser. Use the MCP Inspector for testing.



## **SCREENSHOTS**

<!-- ... [SOME DESCRIPTIVE IMAGES] -->



<br>
<br>

<table>
	<tbody>
		<tr>
			<td valign="middle" width="1200" height="200" >
				<div>
					<img src="https://raw.githubusercontent.com/REVREBEL/.github/main/assets/get-in-touch_dark.png" alt="Get in Touch" width="150" valign="top" />
					&emsp;
					<a href="https://github.com/REVREBEL" target="_blank"><img src="https://raw.githubusercontent.com/REVREBEL/.github/main/assets/icons/github-outline_dark.png" alt="GitHub" width="36" /></a>
					<a href="mailto:hello@revrebel.io" target="_blank" target="_blank"><img src="https://raw.githubusercontent.com/REVREBEL/.github/main/assets/icons/email-outline_dark.png" alt="Email" width="36" /></a>
					<a href="https://www.linkedin.com/company/revrebel/" target="_blank"><img src="https://raw.githubusercontent.com/REVREBEL/.github/main/assets/icons/linkedin-outline.png" alt="LinkedIn" width="36" /></a>
					<a href="https://www.revrebel.io/blog" target="_blank"><img src="https://raw.githubusercontent.com/REVREBEL/.github/main/assets/icons/blog-outline.png" alt="Blog" width="36" /></a>
					<a href="https://revrebel.io" target="_blank" style="display: inline-block;"><img src="https://img.shields.io/badge/website-163666?style=for-the-badge" alt="Website" height="40" align="right" /></a>
				</div>
			</td>
		</tr>
	</tbody>
</table>