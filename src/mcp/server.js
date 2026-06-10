import 'dotenv/config';
import express from 'express';
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual
} from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

// Core Audit Tools
import { auditSeoPageTool } from './tools/audit-seo-page.tool.js';
import { getAuditRunTool } from './tools/get-audit-run.tool.js';
import { listAuditRunsTool } from './tools/list-audit-runs.tool.js';
import { importUrlScanTool } from './tools/import-url-scan.tool.js';
import { runUrlScanTool } from './tools/run-url-scan.tool.js';
import { getUrlScanTool } from './tools/get-url-scan.tool.js';
import { listUrlScansTool } from './tools/list-url-scans.tool.js';
import { refreshUrlScanResultTool } from './tools/refresh-url-scan-result.tool.js';

const GEMINI_TOKEN_ISSUER = 'seo-api-gemini-oauth';
const GEMINI_TOKEN_AUDIENCE = 'seo-api-gemini-mcp';
const GEMINI_REFRESH_TOKEN_AUDIENCE = 'seo-api-gemini-refresh';
const geminiAuthCodes = new Map();

function createSeoMcpServer() {
  const server = new McpServer({
    name: 'seo-api-mcp',
    version: '1.0.0'
  });

  const tools = [
    auditSeoPageTool,
    getAuditRunTool,
    listAuditRunsTool,
    importUrlScanTool,
    runUrlScanTool,
    getUrlScanTool,
    listUrlScansTool,
    refreshUrlScanResultTool
  ];

  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title || tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema || tool.input
      },
      async (args) => {
        try {
          const result = await tool.run(args);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }
            ]
          };
        } catch (error) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: false,
                    error: error?.message || 'Tool execution failed'
                  },
                  null,
                  2
                )
              }
            ]
          };
        }
      }
    );
  }

  return server;
}

function validateMcpSecret(req, res) {
  const configuredSecret = process.env.MCP_SHARED_SECRET;

  if (!configuredSecret) {
    return true;
  }

  const headerSecret = req.headers['x-mcp-secret'];

  if (!headerSecret || headerSecret !== configuredSecret) {
    res.status(403).json({
      error: 'Forbidden: invalid or missing x-mcp-secret'
    });
    return false;
  }

  return true;
}

function getGeminiOAuthConfig() {
  const allowedScopes = (process.env.GEMINI_OAUTH_ALLOWED_SCOPES || 'seo.audit seo.scan')
    .split(/\s+/)
    .filter(Boolean);
  const allowedRedirectUris = (process.env.GEMINI_OAUTH_ALLOWED_REDIRECT_URIS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    clientId: process.env.GEMINI_OAUTH_CLIENT_ID,
    clientSecret: process.env.GEMINI_OAUTH_CLIENT_SECRET,
    tokenSecret: process.env.GEMINI_OAUTH_TOKEN_SECRET,
    accessTokenTtlSeconds: Number(process.env.GEMINI_OAUTH_ACCESS_TOKEN_TTL_SECONDS || 3600),
    codeTtlSeconds: Number(process.env.GEMINI_OAUTH_CODE_TTL_SECONDS || 300),
    allowedScopes,
    allowedRedirectUris
  };
}

function isGeminiOAuthConfigured() {
  const config = getGeminiOAuthConfig();
  return Boolean(config.clientId && config.clientSecret && config.tokenSecret);
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function base64urlJson(value) {
  return base64url(JSON.stringify(value));
}

function safeCompare(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

function signToken(payload, secret) {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };
  const encodedHeader = base64urlJson(header);
  const encodedPayload = base64urlJson(payload);
  const signature = createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function verifyToken(token, secret) {
  const parts = String(token || '').split('.');

  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const expectedSignature = createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  if (!safeCompare(signature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < now) {
      return null;
    }

    if (payload.iss !== GEMINI_TOKEN_ISSUER || payload.aud !== GEMINI_TOKEN_AUDIENCE) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function verifyRefreshToken(token, secret) {
  const parts = String(token || '').split('.');

  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const expectedSignature = createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  if (!safeCompare(signature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < now) {
      return null;
    }

    if (payload.iss !== GEMINI_TOKEN_ISSUER || payload.aud !== GEMINI_REFRESH_TOKEN_AUDIENCE) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function createGeminiAccessToken({ clientId, scope, secret, ttlSeconds }) {
  const now = Math.floor(Date.now() / 1000);

  return signToken(
    {
      iss: GEMINI_TOKEN_ISSUER,
      aud: GEMINI_TOKEN_AUDIENCE,
      sub: clientId,
      scope,
      iat: now,
      exp: now + ttlSeconds,
      jti: randomUUID()
    },
    secret
  );
}

function createGeminiRefreshToken({ clientId, scope, secret }) {
  const now = Math.floor(Date.now() / 1000);

  return signToken(
    {
      iss: GEMINI_TOKEN_ISSUER,
      aud: GEMINI_REFRESH_TOKEN_AUDIENCE,
      sub: clientId,
      scope,
      iat: now,
      jti: randomUUID()
    },
    secret
  );
}

function sendOAuthTokenResponse(res, payload) {
  res.set({
    'Cache-Control': 'no-store',
    Pragma: 'no-cache'
  });
  res.json(payload);
}

function getRequestedScopes(scopeInput, allowedScopes) {
  const requestedScopes = String(scopeInput || '')
    .split(/\s+/)
    .filter(Boolean);

  if (requestedScopes.length === 0) {
    return allowedScopes;
  }

  const invalidScopes = requestedScopes.filter((scope) => !allowedScopes.includes(scope));

  if (invalidScopes.length > 0) {
    return null;
  }

  return requestedScopes;
}

function isRedirectUriAllowed(redirectUri, allowedRedirectUris) {
  if (!redirectUri) {
    return false;
  }

  if (allowedRedirectUris.length === 0) {
    try {
      const parsed = new URL(redirectUri);
      return parsed.protocol === 'https:' || parsed.hostname === 'localhost';
    } catch {
      return false;
    }
  }

  return allowedRedirectUris.includes(redirectUri);
}

function redirectWithOAuthError(res, redirectUri, state, error, errorDescription) {
  if (!redirectUri) {
    res.status(400).json({
      error,
      error_description: errorDescription
    });
    return;
  }

  try {
    const redirect = new URL(redirectUri);
    redirect.searchParams.set('error', error);

    if (errorDescription) {
      redirect.searchParams.set('error_description', errorDescription);
    }

    if (state) {
      redirect.searchParams.set('state', state);
    }

    res.redirect(302, redirect.toString());
  } catch {
    res.status(400).json({
      error,
      error_description: errorDescription
    });
  }
}

function createGeminiAuthCode({ clientId, redirectUri, scope, codeChallenge, codeChallengeMethod }) {
  const config = getGeminiOAuthConfig();
  const code = randomBytes(32).toString('base64url');

  geminiAuthCodes.set(code, {
    clientId,
    redirectUri,
    scope,
    codeChallenge,
    codeChallengeMethod,
    expiresAt: Date.now() + config.codeTtlSeconds * 1000
  });

  return code;
}

function consumeGeminiAuthCode(code) {
  const record = geminiAuthCodes.get(code);
  geminiAuthCodes.delete(code);

  if (!record || record.expiresAt < Date.now()) {
    return null;
  }

  return record;
}

function verifyPkce(record, codeVerifier) {
  if (!record.codeChallenge) {
    return true;
  }

  if (!codeVerifier) {
    return false;
  }

  if (record.codeChallengeMethod === 'S256') {
    const hashedVerifier = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    return safeCompare(hashedVerifier, record.codeChallenge);
  }

  return safeCompare(codeVerifier, record.codeChallenge);
}

function parseBasicAuth(req) {
  const authHeader = req.headers.authorization || '';

  if (!authHeader.startsWith('Basic ')) {
    return {};
  }

  try {
    const decoded = Buffer.from(authHeader.slice('Basic '.length), 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');

    if (separatorIndex === -1) {
      return {};
    }

    return {
      clientId: decoded.slice(0, separatorIndex),
      clientSecret: decoded.slice(separatorIndex + 1)
    };
  } catch {
    return {};
  }
}

function validateGeminiBearerToken(req, res) {
  const config = getGeminiOAuthConfig();

  if (!isGeminiOAuthConfigured()) {
    res.status(503).json({
      error: 'Gemini OAuth is not configured'
    });
    return false;
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : null;

  if (!token) {
    res.status(401).json({
      error: 'Unauthorized: missing bearer token'
    });
    return false;
  }

  const payload = verifyToken(token, config.tokenSecret);

  if (!payload) {
    res.status(401).json({
      error: 'Unauthorized: invalid or expired bearer token'
    });
    return false;
  }

  req.oauth = payload;
  return true;
}

async function handleMcpRequest({ req, res }) {
  const sessionId = req.headers['mcp-session-id'];
  let transport = sessionId ? transports[sessionId] : undefined;

  if (!transport && isInitializeRequest(req.body)) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (newSessionId) => {
        transports[newSessionId] = transport;
      }
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        delete transports[transport.sessionId];
      }
    };

    const server = createSeoMcpServer();
    await server.connect(transport);
  } else if (!transport) {
    res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Bad Request: No valid MCP session ID provided'
      },
      id: null
    });
    return;
  }

  await transport.handleRequest(req, res, req.body);
}

async function handleMcpGetOrDelete({ req, res }) {
  const sessionId = req.headers['mcp-session-id'];
  const transport = sessionId ? transports[sessionId] : undefined;

  if (!transport) {
    res.status(400).send('Invalid or missing MCP session ID');
    return;
  }

  await transport.handleRequest(req, res);
}

const app = express();

app.get('/health', (req, res) => {
  res.json({
    status: 'UP',
    service: 'seo-api-mcp',
    timestamp: new Date().toISOString()
  });
});

app.get('/gemini/oauth/authorize', (req, res) => {
  const config = getGeminiOAuthConfig();
  const {
    response_type: responseType,
    client_id: clientId,
    redirect_uri: redirectUri,
    scope,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod = 'plain'
  } = req.query;

  if (!isGeminiOAuthConfigured()) {
    res.status(503).json({
      error: 'server_error',
      error_description: 'Gemini OAuth is not configured'
    });
    return;
  }

  if (!isRedirectUriAllowed(redirectUri, config.allowedRedirectUris)) {
    res.status(400).json({
      error: 'invalid_request',
      error_description: 'Invalid or disallowed redirect_uri'
    });
    return;
  }

  if (responseType !== 'code') {
    redirectWithOAuthError(res, redirectUri, state, 'unsupported_response_type', 'Only response_type=code is supported');
    return;
  }

  if (clientId !== config.clientId) {
    redirectWithOAuthError(res, redirectUri, state, 'unauthorized_client', 'Invalid client_id');
    return;
  }

  if (codeChallenge && !['plain', 'S256'].includes(codeChallengeMethod)) {
    redirectWithOAuthError(res, redirectUri, state, 'invalid_request', 'Unsupported code_challenge_method');
    return;
  }

  const requestedScopes = getRequestedScopes(scope, config.allowedScopes);

  if (!requestedScopes) {
    redirectWithOAuthError(res, redirectUri, state, 'invalid_scope', 'One or more requested scopes are not allowed');
    return;
  }

  const code = createGeminiAuthCode({
    clientId,
    redirectUri,
    scope: requestedScopes.join(' '),
    codeChallenge,
    codeChallengeMethod
  });
  const redirect = new URL(redirectUri);
  redirect.searchParams.set('code', code);

  if (state) {
    redirect.searchParams.set('state', state);
  }

  res.redirect(302, redirect.toString());
});

app.post(
  '/gemini/oauth/token',
  express.urlencoded({ extended: false }),
  express.json(),
  (req, res) => {
    const config = getGeminiOAuthConfig();

    if (!isGeminiOAuthConfigured()) {
      res.status(503).json({
        error: 'server_error',
        error_description: 'Gemini OAuth is not configured'
      });
      return;
    }

    const basicAuth = parseBasicAuth(req);
    const clientId = req.body.client_id || basicAuth.clientId;
    const clientSecret = req.body.client_secret || basicAuth.clientSecret;
    const grantType = req.body.grant_type;
    const code = req.body.code;
    const redirectUri = req.body.redirect_uri;
    const codeVerifier = req.body.code_verifier;
    const refreshToken = req.body.refresh_token;

    if (!['authorization_code', 'refresh_token'].includes(grantType)) {
      res.status(400).json({
        error: 'unsupported_grant_type',
        error_description: 'Only authorization_code and refresh_token grants are supported'
      });
      return;
    }

    if (clientId !== config.clientId || !safeCompare(clientSecret, config.clientSecret)) {
      res.status(401).json({
        error: 'invalid_client',
        error_description: 'Invalid client credentials'
      });
      return;
    }

    if (grantType === 'refresh_token') {
      const refreshPayload = verifyRefreshToken(refreshToken, config.tokenSecret);

      if (!refreshPayload || refreshPayload.sub !== clientId) {
        res.status(400).json({
          error: 'invalid_grant',
          error_description: 'Invalid refresh token'
        });
        return;
      }

      const accessToken = createGeminiAccessToken({
        clientId,
        scope: refreshPayload.scope,
        secret: config.tokenSecret,
        ttlSeconds: config.accessTokenTtlSeconds
      });

      sendOAuthTokenResponse(res, {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: config.accessTokenTtlSeconds,
        scope: refreshPayload.scope
      });
      return;
    }

    const authCode = consumeGeminiAuthCode(code);

    if (!authCode) {
      res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Invalid or expired authorization code'
      });
      return;
    }

    if (authCode.clientId !== clientId || authCode.redirectUri !== redirectUri) {
      res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Authorization code does not match client or redirect URI'
      });
      return;
    }

    if (!verifyPkce(authCode, codeVerifier)) {
      res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Invalid PKCE verifier'
      });
      return;
    }

    const accessToken = createGeminiAccessToken({
      clientId,
      scope: authCode.scope,
      secret: config.tokenSecret,
      ttlSeconds: config.accessTokenTtlSeconds
    });
    const issuedRefreshToken = createGeminiRefreshToken({
      clientId,
      scope: authCode.scope,
      secret: config.tokenSecret
    });

    sendOAuthTokenResponse(res, {
      access_token: accessToken,
      refresh_token: issuedRefreshToken,
      token_type: 'Bearer',
      expires_in: config.accessTokenTtlSeconds,
      scope: authCode.scope
    });
  }
);

const transports = {};

app.post('/mcp', express.json(), async (req, res) => {
  try {
    if (!validateMcpSecret(req, res)) {
      return;
    }

    await handleMcpRequest({ req, res });
  } catch (error) {
    console.error('MCP POST /mcp error:', error);

    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error'
        },
        id: null
      });
    }
  }
});

app.post('/gemini/mcp', express.json(), async (req, res) => {
  try {
    if (!validateGeminiBearerToken(req, res)) {
      return;
    }

    await handleMcpRequest({ req, res });
  } catch (error) {
    console.error('MCP POST /gemini/mcp error:', error);

    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error'
        },
        id: null
      });
    }
  }
});

app.get('/mcp', async (req, res) => {
  try {
    if (!validateMcpSecret(req, res)) {
      return;
    }

    await handleMcpGetOrDelete({ req, res });
  } catch (error) {
    console.error('MCP GET /mcp error:', error);

    if (!res.headersSent) {
      res.status(500).send('Internal server error');
    }
  }
});

app.get('/gemini/mcp', async (req, res) => {
  try {
    if (!validateGeminiBearerToken(req, res)) {
      return;
    }

    await handleMcpGetOrDelete({ req, res });
  } catch (error) {
    console.error('MCP GET /gemini/mcp error:', error);

    if (!res.headersSent) {
      res.status(500).send('Internal server error');
    }
  }
});

app.delete('/mcp', async (req, res) => {
  try {
    if (!validateMcpSecret(req, res)) {
      return;
    }

    await handleMcpGetOrDelete({ req, res });
  } catch (error) {
    console.error('MCP DELETE /mcp error:', error);

    if (!res.headersSent) {
      res.status(500).send('Internal server error');
    }
  }
});

app.delete('/gemini/mcp', async (req, res) => {
  try {
    if (!validateGeminiBearerToken(req, res)) {
      return;
    }

    await handleMcpGetOrDelete({ req, res });
  } catch (error) {
    console.error('MCP DELETE /gemini/mcp error:', error);

    if (!res.headersSent) {
      res.status(500).send('Internal server error');
    }
  }
});

const port = Number(process.env.MCP_SERVER_PORT || 3010);

app.listen(port, () => {
  console.log(`seo-api MCP server listening on port ${port}`);
});
