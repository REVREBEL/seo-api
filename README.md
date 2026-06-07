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

| Variable            | Required         | Description                                      |
|---------------------|------------------|--------------------------------------------------|
| `REVREBEL_API_KEY`  | Yes (production) | API key required for `/api/*` routes             |
| `PORT`              | No               | Server port. Defaults to `3000`                  |
| `NODE_ENV`          | No               | Set to `production` for hardened startup checks  |

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
  -H "x-api-key: rebel-default-development-key" \
  -d '{"url":"https://example.com","renderMode":"browser","viewport":"desktop"}'
```

---

## Unauthorized Request Test

Requests without a valid API key should return `401 Unauthorized`:

```bash
curl -X POST http://localhost:3000/api/audit \
  -H "Content-Type: application/json" \
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

| Field                 | Type      | Default    | Description                                                |
|-----------------------|-----------|------------|------------------------------------------------------------|
| `url`                 | `string`  | *required* | The URL to audit                                           |
| `renderMode`          | `string`  | `"static"` | `"static"` or `"browser"`                                 |
| `includePerformance`  | `boolean` | `false`    | Run Lighthouse performance audit (slower)                  |
| `includeAccessibility`| `boolean` | `false`    | Run axe-core accessibility audit (requires browser mode)   |
| `viewport`            | `string`  | `"desktop"`| `"desktop"`, `"tablet"`, or `"mobile"` (browser mode only) |

---

## PM2 Deployment

Install PM2 globally and start the service:

```bash
npm install -g pm2
pm2 start src/index.js --name website-healthcheck --interpreter node
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
- `REVREBEL_API_KEY` is **required** in production — the server will exit on startup if missing.
- Use HTTPS in production via Nginx with Let's Encrypt (`certbot`).
- Playwright's Chromium process is a singleton per server instance — it is shared across requests and gracefully closed on SIGTERM/SIGINT.
- The `/health` and `/openapi.json` endpoints are public and do not require an API key.
