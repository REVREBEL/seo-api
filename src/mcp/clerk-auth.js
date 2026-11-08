import { createClerkClient } from '@clerk/backend';
import { verifyClerkToken } from '@clerk/mcp-tools/server';

export const DEFAULT_MCP_RESOURCE_URL = 'https://clerk-mcp.revrebel.io/mcp';
export const DEFAULT_CLERK_ISSUER = 'https://clerk.revrebel.io';

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

export function getMcpResourceUrl(env = process.env) {
  return trimTrailingSlash(env.MCP_RESOURCE_URL || DEFAULT_MCP_RESOURCE_URL);
}

export function getClerkIssuer(env = process.env) {
  return trimTrailingSlash(env.CLERK_ISSUER || DEFAULT_CLERK_ISSUER);
}

export function getSupportedScopes(env = process.env) {
  return String(env.MCP_OAUTH_SCOPES || 'profile email')
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

export function deriveProtectedResourceMetadataUrl(resourceUrl) {
  const resource = new URL(resourceUrl);
  const resourcePath = resource.pathname === '/' ? '' : resource.pathname.replace(/\/$/, '');
  return new URL(`/.well-known/oauth-protected-resource${resourcePath}`, resource.origin).href;
}

export function deriveAuthorizationServerMetadataUrl(issuer) {
  return new URL('/.well-known/oauth-authorization-server', trimTrailingSlash(issuer)).href;
}

export function buildProtectedResourceMetadata({
  resourceUrl = getMcpResourceUrl(),
  issuer = getClerkIssuer(),
  scopes = getSupportedScopes(),
} = {}) {
  return {
    resource: resourceUrl,
    authorization_servers: [issuer],
    ...(scopes.length > 0 ? { scopes_supported: scopes } : {}),
  };
}

function parseVerifiedJwtPayload(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export function audienceContainsExactResource(audience, resourceUrl) {
  if (typeof audience === 'string') {
    return audience === resourceUrl;
  }

  return Array.isArray(audience) && audience.some((entry) => entry === resourceUrl);
}

function createDefaultClerkClient(env = process.env) {
  return createClerkClient({
    secretKey: env.CLERK_SECRET_KEY,
    publishableKey: env.CLERK_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    apiUrl: env.CLERK_API_URL,
  });
}

/**
 * Creates a verifier for Clerk OAuth access tokens.
 *
 * Clerk performs signature, token-type, expiry and resource-aware audience validation
 * through authenticateRequest(). After that verification succeeds, JWT tokens receive
 * an additional explicit issuer/expiry/exact-audience check. Opaque tokens are never
 * decoded; they rely on Clerk's resource-aware verified result.
 */
export function createClerkMcpVerifier({
  clerkClient,
  verifyClerkTokenFn = verifyClerkToken,
  resourceUrl = getMcpResourceUrl(),
  issuer = getClerkIssuer(),
  now = () => Math.floor(Date.now() / 1000),
  env = process.env,
} = {}) {
  let resolvedClient = clerkClient;

  return async function verifyMcpToken(request) {
    try {
      resolvedClient ??= createDefaultClerkClient(env);

      const requestState = await resolvedClient.authenticateRequest(request, {
        acceptsToken: 'oauth_token',
        audience: resourceUrl,
      });

      if (!requestState?.isAuthenticated) {
        return undefined;
      }

      const token = requestState.token;
      const authInfo = verifyClerkTokenFn(requestState.toAuth(), token);

      if (!authInfo) {
        return undefined;
      }

      // Only inspect claims after Clerk has cryptographically authenticated the token.
      // For opaque OAuth tokens, authenticateRequest() is the proof and already received
      // the exact resource audience above; never decode opaque data as authentication.
      const payload = parseVerifiedJwtPayload(token);
      if (payload) {
        if (trimTrailingSlash(payload.iss) !== trimTrailingSlash(issuer)) {
          return undefined;
        }

        if (!Number.isFinite(payload.exp) || payload.exp <= now()) {
          return undefined;
        }

        if (!audienceContainsExactResource(payload.aud, resourceUrl)) {
          return undefined;
        }
      }

      return {
        ...authInfo,
        resourceMetadataUrl: deriveProtectedResourceMetadataUrl(resourceUrl),
      };
    } catch (error) {
      console.error('Clerk MCP access token verification failed', error);
      return undefined;
    }
  };
}

export const verifyMcpToken = createClerkMcpVerifier();

export const MCP_RESOURCE_URL = getMcpResourceUrl();
export const CLERK_ISSUER = getClerkIssuer();
export const RESOURCE_METADATA_URL = deriveProtectedResourceMetadataUrl(MCP_RESOURCE_URL);
export const AUTHORIZATION_SERVER_METADATA_URL =
  deriveAuthorizationServerMetadataUrl(CLERK_ISSUER);
