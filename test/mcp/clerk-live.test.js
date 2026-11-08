import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { installClerkProtectedMcp } from '../../src/mcp/clerk-mcp.js';
import {
  CLERK_ISSUER,
  MCP_RESOURCE_URL,
  RESOURCE_METADATA_URL,
  verifyMcpToken,
} from '../../src/mcp/clerk-auth.js';

const token = process.env.CLERK_TEST_OAUTH_ACCESS_TOKEN;

test(
  'live Clerk sign-in access token authenticates and completes an MCP tool call',
  { skip: !process.env.CLERK_LIVE_TEST || !token },
  async () => {
    const app = express();
    const serverFactory = () => {
      const server = new McpServer({ name: 'clerk-live-test', version: '1.0.0' });
      server.registerTool(
        'auth_ping',
        { description: 'Returns pong after real Clerk OAuth authentication' },
        async () => ({ content: [{ type: 'text', text: 'pong' }] }),
      );
      return server;
    };

    installClerkProtectedMcp({
      app,
      createServer: serverFactory,
      verifier: verifyMcpToken,
      resourceUrl: MCP_RESOURCE_URL,
      issuer: CLERK_ISSUER,
      resourceMetadataUrl: RESOURCE_METADATA_URL,
    });

    const httpServer = app.listen(0, '127.0.0.1');
    await once(httpServer, 'listening');
    const address = httpServer.address();

    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/mcp`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'auth_ping', arguments: {} },
        }),
      });
      const body = await response.text();
      assert.equal(response.status, 200, body);
      assert.match(body, /pong/);
    } finally {
      await new Promise((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
      });
    }
  },
);
