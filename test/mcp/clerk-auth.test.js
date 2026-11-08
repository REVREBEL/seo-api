import test from 'node:test';
import assert from 'node:assert/strict';
import {
  audienceContainsExactResource,
  createClerkMcpVerifier,
  deriveAuthorizationServerMetadataUrl,
  deriveProtectedResourceMetadataUrl,
} from '../../src/mcp/clerk-auth.js';

const RESOURCE = 'https://clerk.revrebel.io/mcp';
const ISSUER = 'https://clerk.revrebel.io';

function fakeJwt(payload) {
  return [
    Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify(payload)).toString('base64url'),
    'verified-by-test-double',
  ].join('.');
}

function createFakeClerkClient(token, { authenticated = true } = {}) {
  return {
    async authenticateRequest(request, options) {
      assert.equal(options.acceptsToken, 'oauth_token');
      assert.equal(options.audience, RESOURCE);
      assert.equal(request.headers.get('authorization'), `Bearer ${token}`);
      return {
        isAuthenticated: authenticated,
        token,
        toAuth: () => ({ userId: 'user_test' }),
      };
    },
  };
}

const verifiedAuthInfo = {
  token: 'verified',
  clientId: 'client_test',
  scopes: ['profile', 'email'],
  extra: { userId: 'user_test' },
};

test('derives RFC 9728 protected-resource metadata from the exact resource URI', () => {
  assert.equal(
    deriveProtectedResourceMetadataUrl(RESOURCE),
    'https://clerk.revrebel.io/.well-known/oauth-protected-resource/mcp',
  );
  assert.equal(
    deriveAuthorizationServerMetadataUrl(ISSUER),
    'https://clerk.revrebel.io/.well-known/oauth-authorization-server',
  );
});

test('audience matching uses the exact resource URI, not an origin or prefix', () => {
  assert.equal(audienceContainsExactResource(RESOURCE, RESOURCE), true);
  assert.equal(audienceContainsExactResource([RESOURCE], RESOURCE), true);
  assert.equal(audienceContainsExactResource('https://clerk.revrebel.io', RESOURCE), false);
  assert.equal(audienceContainsExactResource('https://clerk.revrebel.io/mcp/', RESOURCE), false);
});

test('accepts a Clerk-verified OAuth JWT with exact issuer, expiry, and audience', async () => {
  const token = fakeJwt({
    iss: ISSUER,
    aud: RESOURCE,
    exp: 4_000_000_000,
    sub: 'user_test',
  });
  const verifier = createClerkMcpVerifier({
    clerkClient: createFakeClerkClient(token),
    verifyClerkTokenFn: () => verifiedAuthInfo,
    resourceUrl: RESOURCE,
    issuer: ISSUER,
    now: () => 2_000_000_000,
  });

  const authInfo = await verifier(
    new Request(RESOURCE, { headers: { authorization: `Bearer ${token}` } }),
  );

  assert.equal(authInfo.extra.userId, 'user_test');
  assert.equal(
    authInfo.resourceMetadataUrl,
    'https://clerk.revrebel.io/.well-known/oauth-protected-resource/mcp',
  );
});

test('rejects expired Clerk OAuth JWTs after verification', async () => {
  const token = fakeJwt({
    iss: ISSUER,
    aud: RESOURCE,
    exp: 1_999_999_999,
  });
  const verifier = createClerkMcpVerifier({
    clerkClient: createFakeClerkClient(token),
    verifyClerkTokenFn: () => verifiedAuthInfo,
    resourceUrl: RESOURCE,
    issuer: ISSUER,
    now: () => 2_000_000_000,
  });

  assert.equal(
    await verifier(new Request(RESOURCE, { headers: { authorization: `Bearer ${token}` } })),
    undefined,
  );
});

test('rejects wrong-audience Clerk OAuth JWTs after verification', async () => {
  const token = fakeJwt({
    iss: ISSUER,
    aud: 'https://clerk.revrebel.io/another-resource',
    exp: 4_000_000_000,
  });
  const verifier = createClerkMcpVerifier({
    clerkClient: createFakeClerkClient(token),
    verifyClerkTokenFn: () => verifiedAuthInfo,
    resourceUrl: RESOURCE,
    issuer: ISSUER,
    now: () => 2_000_000_000,
  });

  assert.equal(
    await verifier(new Request(RESOURCE, { headers: { authorization: `Bearer ${token}` } })),
    undefined,
  );
});

test('rejects wrong-issuer JWTs after Clerk verification', async () => {
  const token = fakeJwt({
    iss: 'https://other.example.com',
    aud: RESOURCE,
    exp: 4_000_000_000,
  });
  const verifier = createClerkMcpVerifier({
    clerkClient: createFakeClerkClient(token),
    verifyClerkTokenFn: () => verifiedAuthInfo,
    resourceUrl: RESOURCE,
    issuer: ISSUER,
    now: () => 2_000_000_000,
  });

  assert.equal(
    await verifier(new Request(RESOURCE, { headers: { authorization: `Bearer ${token}` } })),
    undefined,
  );
});

test('opaque OAuth tokens are never decoded locally after Clerk resource-aware verification', async () => {
  const token = 'opaque-clerk-oauth-access-token';
  const verifier = createClerkMcpVerifier({
    clerkClient: createFakeClerkClient(token),
    verifyClerkTokenFn: () => verifiedAuthInfo,
    resourceUrl: RESOURCE,
    issuer: ISSUER,
  });

  const authInfo = await verifier(
    new Request(RESOURCE, { headers: { authorization: `Bearer ${token}` } }),
  );
  assert.equal(authInfo.extra.userId, 'user_test');
});

test('session tokens are rejected because Clerk verification is constrained to oauth_token', async () => {
  const token = 'session-token';
  const verifier = createClerkMcpVerifier({
    clerkClient: createFakeClerkClient(token, { authenticated: false }),
    verifyClerkTokenFn: () => {
      throw new Error('verifyClerkToken must not run for a rejected session token');
    },
    resourceUrl: RESOURCE,
    issuer: ISSUER,
  });

  assert.equal(
    await verifier(new Request(RESOURCE, { headers: { authorization: `Bearer ${token}` } })),
    undefined,
  );
});
