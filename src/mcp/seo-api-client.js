const SEO_API_BASE_URL =
  process.env.SEO_API_BASE_URL || "https://seo-api.revrebel.io";

function getSeoApiKey() {
  return process.env.SEO_API_KEY;
}

async function requestJson(path, options = {}) {
  const apiKey = getSeoApiKey();

  if (!apiKey) {
    return {
      success: false,
      statusCode: 500,
      error: "SEO_API_KEY is not configured",
      message: "The MCP server cannot call seo-api because SEO_API_KEY is missing from the process environment.",
    };
  }

  const url = new URL(path, SEO_API_BASE_URL);

  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      ...(options.headers || {}),
    },
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    return {
      success: false,
      statusCode: response.status,
      error: body?.error || `seo-api request failed with status ${response.status}`,
      message: body?.message || response.statusText,
      details: body,
    };
  }

  if (body === null) {
    return {
      success: false,
      statusCode: response.status,
      error: "Invalid JSON response from API",
      message:
        "The API returned a successful status but the response body was not valid JSON.",
    };
  }

  return body;
}