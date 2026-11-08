import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { installClerkProtectedMcp } from '../../src/mcp/clerk-mcp.js';

const RESOURCE = 'https://clerk-mcp.revrebel.io/mcp';
const ISSUER = 'https://clerk.revrebel.io';
const METADATA = 'https://clerk-mcp.revrebel.io/.well-known/oauth-protected-resource/mcp';

async function start(app) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  };
}

function jsonRpcBody(method, params, id = 1) {
  return JSON.stringify({
    jsonrpc: '2.0',
    id,
    method,
    ...(params ? { params } : {}),
  });
}

async function postMcp(origin, token, body) {
  return fetch(`${origin}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body,
  });
}

function createTestServerFactory(counter) {
  return () => {
    counter.count += 1;
    const server = new McpServer({ name: 'clerk-auth-test', version: '1.0.0' });
    server.registerTool(
      'auth_ping',
      {
        description: 'Returns pong for an authenticated MCP request',
      },
      async () => ({
        content: [{ type: 'text', text: 'pong' }],
      }),
    );
    return server;
  };
}

test('protected-resource metadata is public and references the Clerk issuer', async () => {
  const app = express();
  installClerkProtectedMcp({
    app,
    createServer: createTestServerFactory({ count: 0 }),
    verifier: async () => undefined,
    resourceUrl: RESOURCE,
    issuer: ISSUER,
    resourceMetadataUrl: METADATA,
  });
  const runtime = await start(app);

  try {
    const response = await fetch(
      `${runtime.origin}/.well-known/oauth-protected-resource/mcp`,
    );
    assert.equal(response.status, 200);
    const metadata = await response.json();
    assert.equal(metadata.resource, RESOURCE);
    assert.deepEqual(metadata.authorization_servers, [ISSUER]);
  } finally {
    await runtime.close();
  }
});

test('missing bearer token returns an MCP-compatible OAuth challenge', async () => {
  const app = express();
  installClerkProtectedMcp({
    app,
    createServer: createTestServerFactory({ count: 0 }),
    verifier: async () => undefined,
    resourceUrl: RESOURCE,
    issuer: ISSUER,
    resourceMetadataUrl: METADATA,
  });
  const runtime = await start(app);

  try {
    const response = await postMcp(
      runtime.origin,
      null,
      jsonRpcBody('tools/list', undefined),
    );
    assert.equal(response.status, 401);
    assert.match(
      response.headers.get('www-authenticate') || '',
      /resource_metadata="https:\/\/clerk-mcp\.revrebel\.io\/\.well-known\/oauth-protected-resource\/mcp"/,
    );
    assert.match(response.headers.get('www-authenticate') || '', /error="invalid_token"/);
  } finally {
    await runtime.close();
  }
});

test('a Clerk-authenticated OAuth request can call an MCP tool', async () => {
  const app = express();
  const counter = { count: 0 };
  installClerkProtectedMcp({
    app,
    createServer: createTestServerFactory(counter),
    verifier: async () => ({
      clientId: 'client_test',
      scopes: ['profile', 'email'],
      extra: { userId: 'user_test' },
      resourceMetadataUrl: METADATA,
    }),
    resourceUrl: RESOURCE,
    issuer: ISSUER,
    resourceMetadataUrl: METADATA,
  });
  const runtime = await start(app);

  try {
    const response = await postMcp(
      runtime.origin,
      'oauth-token-from-clerk-sign-in',
      jsonRpcBody('tools/call', { name: 'auth_ping', arguments: {} }),
    );
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /pong/);
    assert.equal(counter.count, 1);
  } finally {
    await runtime.close();
  }
});

test('stateless handler creates a fresh server for repeated and concurrent calls', async () => {
  const app = express();
  const counter = { count: 0 };
  installClerkProtectedMcp({
    app,
    createServer: createTestServerFactory(counter),
    verifier: async () => ({
      clientId: 'client_test',
      scopes: [],
      extra: { userId: 'user_test' },
      resourceMetadataUrl: METADATA,
    }),
    resourceUrl: RESOURCE,
    issuer: ISSUER,
    resourceMetadataUrl: METADATA,
  });
  const runtime = await start(app);

  try {
    const sequential = await postMcp(
      runtime.origin,
      'valid',
      jsonRpcBody('tools/call', { name: 'auth_ping', arguments: {} }, 1),
    );
    assert.equal(sequential.status, 200);

    const concurrent = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        postMcp(
          runtime.origin,
          'valid',
          jsonRpcBody('tools/call', { name: 'auth_ping', arguments: {} }, index + 2),
        ),
      ),
    );

    assert.ok(concurrent.every((response) => response.status === 200));
    assert.equal(counter.count, 9);
  } finally {
    await runtime.close();
  }
});
