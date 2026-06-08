# seo-api

REVREBEL `seo-api` is a Node.js service for website intelligence, technical SEO audits, hospitality commercial signals, structured data extraction, URL scanner persistence, and MCP-based agent access.

Production API:

```text
https://seo-api.revrebel.io
```

The service runs as two PM2 processes:

```text
seo-api      -> main REST API on port 3000
seo-api-mcp  -> MCP wrapper on port 3010
