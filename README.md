# REVREBEL Website Healthcheck API

A clean-room, robust Node.js microservice architecture designed to perform Technical SEO, Accessibility, Performance, and Hotel Commercial Audits.

## Overview

This API securely ingests web pages either via a static HTML fetch or a headless Playwright browser rendering engine to extract and score:
- Technical SEO (Robots, Sitemaps, Meta tags, Canonicalization)
- Accessibility (axe-core standards)
- Performance (Google Lighthouse)
- Structured Data (Schema.org/JSON-LD)
- Hotel Commercial viability & Technology Detection

## Installation

1. Install all required dependencies:
   ```bash
   npm install
   ```

2. Install the necessary headless browser dependencies for Playwright (required for Ubuntu/Linux execution environments):
   ```bash
   npx playwright install --with-deps chromium
   ```

3. Configure your environment variables in a `.env` file (if you are running in production, the API will fail to start without an API key):
   ```
   NODE_ENV=development
   PORT=3000
   REVREBEL_API_KEY=rebel-default-development-key
   ```

## Local Run

Start the API service locally:
```bash
npm start
```
The server will default to port 3000 if not specified in the environment.

## Endpoints and Usage

### 1. Health Check
An unauthenticated endpoint to verify the service is running.
```bash
curl -X GET http://localhost:3000/health
```

### 2. Static Audit (Fast)
Performs a fast, static HTML analysis using standard network fetch without executing JavaScript.

```bash
curl -X POST http://localhost:3000/api/audit \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: <YOUR_API_KEY>' \
  -d '{
    "url": "https://example.com",
    "renderMode": "static"
  }'
```

### 3. Browser Audit (Dynamic / JS Heavy)
Performs a deep, headless Playwright analysis. Required for Single Page Applications (SPAs) or sites reliant on JavaScript.

```bash
curl -X POST http://localhost:3000/api/audit \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: <YOUR_API_KEY>' \
  -d '{
    "url": "https://example.com",
    "renderMode": "browser",
    "includeAccessibility": true,
    "includePerformance": true
  }'
```

### 4. OpenAPI Specification
The server automatically serves its static OpenAPI documentation asset.
**URL:** `http://localhost:3000/openapi.json`

## Production Deployment (Ubuntu/PM2/Nginx Notes)

For production deployment on an Ubuntu server:
1. **PM2:** Use `pm2` to manage the Node.js process and handle restarts gracefully.
   ```bash
   npm install -g pm2
   pm2 start src/index.js --name revrebel-api --env production
   pm2 save
   ```
2. **Environment:** Ensure `NODE_ENV=production` and `REVREBEL_API_KEY` are explicitly defined. The system is designed to "fail closed" on startup if these are missing.
3. **Playwright Isolation:** Playwright handles process orchestration dynamically. Do not pass manual `--sandbox` arguments when running as root unless strictly necessary. Ensure you have run `npx playwright install --with-deps chromium` on the host machine.
4. **Nginx Reverse Proxy:** Pass traffic securely through Nginx:
   ```nginx
   server {
       listen 80;
       server_name api.yourdomain.com;
       
       location / {
           proxy_pass http://localhost:3000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       }
   }
   ```
