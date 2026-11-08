import cors from 'cors';
import express from 'express';
import { streamableHttpHandler } from '@clerk/mcp-tools/express';
import {
  buildProtectedResourceMetadata,
  CLERK_ISSUER,
  MCP_RESOURCE_URL,
  RESOURCE_METADATA_URL,
  verifyMcpToken,
} from './clerk-auth.js';

function bearerChallenge(resourceMetadataUrl, error = 'invalid_token') {
  return `Bearer resource_metadata="${resourceMetadataUrl}", error="${error}"`;
}

async function authenticateClerkRequest({
  req,
  res,
  verifier,
  resourceUrl,
  resourceMetadataUrl,
  additionalAuthorization,
}) {
  const authInfo = await verifier(
    new Request(resourceUrl, {
      headers: {
        authorization: req.get('authorization') ?? '',
      },
    }),
  );

  if (!authInfo) {
    res
      .status(401)
      .set('WWW-Authenticate', bearerChallenge(resourceMetadataUrl))
      .json({ error: 'invalid_token' });
    return undefined;
  }

  // Preserve the server's pre-existing authorization rule as an additional gate.
  // OAuth is verified first so missing/invalid OAuth tokens always receive the
  // standards-compatible MCP challenge.
  if (additionalAuthorization) {
    const allowed = await additionalAuthorization(req, res, authInfo);
    if (!allowed) {
      return undefined;
    }
  }

  Object.assign(req, { auth: authInfo });
  return authInfo;
}

export function installClerkProtectedMcp({
  app,
  createServer,
  verifier = verifyMcpToken,
  additionalAuthorization,
  resourceUrl = MCP_RESOURCE_URL,
  issuer = CLERK_ISSUER,
  resourceMetadataUrl = RESOURCE_METADATA_URL,
} = {}) {
  if (!app || typeof app.post !== 'function') {
    throw new TypeError('installClerkProtectedMcp requires an Express app');
  }
  if (typeof createServer !== 'function') {
    throw new TypeError('installClerkProtectedMcp requires createServer');
  }

  const resourcePath = new URL(resourceUrl).pathname;
  const metadataPath = new URL(resourceMetadataUrl).pathname;
  const corsMiddleware = cors({
    origin: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    exposedHeaders: ['WWW-Authenticate'],
  });
  const statelessHandler = streamableHttpHandler(createServer);

  app.options(metadataPath, corsMiddleware);
  app.get(metadataPath, corsMiddleware, (_req, res) => {
    res
      .set('Cache-Control', 'public, max-age=300')
      .json(buildProtectedResourceMetadata({ resourceUrl, issuer }));
  });

  app.options(resourcePath, corsMiddleware);
  app.post(
    resourcePath,
    corsMiddleware,
    express.json(),
    async (req, res) => {
      try {
        const authInfo = await authenticateClerkRequest({
          req,
          res,
          verifier,
          resourceUrl,
          resourceMetadataUrl,
          additionalAuthorization,
        });
        if (!authInfo) return;

        await statelessHandler(req, res);
      } catch (error) {
        console.error(`MCP POST ${resourcePath} error:`, error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal server error',
            },
            id: null,
          });
        }
      }
    },
  );

  // Stateless Streamable HTTP intentionally supports POST only. Keep all requests
  // to the protected resource authenticated before returning method semantics.
  app.all(resourcePath, corsMiddleware, async (req, res) => {
    const authInfo = await authenticateClerkRequest({
      req,
      res,
      verifier,
      resourceUrl,
      resourceMetadataUrl,
      additionalAuthorization,
    });
    if (!authInfo) return;

    res
      .status(405)
      .set('Allow', 'POST, OPTIONS')
      .json({ error: 'method_not_allowed' });
  });

  return {
    resourcePath,
    metadataPath,
    resourceMetadataUrl,
  };
}

export { bearerChallenge };
