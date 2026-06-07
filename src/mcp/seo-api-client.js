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
  if (limit !== undefined) params.set("limit", String(limit));
  if (offset !== undefined) params.set("offset", String(offset));

  const query = params.toString();
  const path = query ? `/api/audits?${query}` : "/api/audits";

  return requestJson(path, {
    method: "GET",
  });
}
