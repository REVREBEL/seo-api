import 'dotenv/config';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

import { auditSeoPageTool } from './tools/audit-seo-page.tool.js';
import { getAuditRunTool } from './tools/get-audit-run.tool.js';
import { listAuditRunsTool } from './tools/list-audit-runs.tool.js';

function createSeoMcpServer() {
  const server = new McpServer({
    name: 'seo-api-mcp',
    version: '1.0.0'
  });

  const tools = [
    auditSeoPageTool,
    getAuditRunTool,
    listAuditRunsTool
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

const app = express();

app.get('/health', (req, res) => {
  res.json({
    status: 'UP',
    service: 'seo-api-mcp',
    timestamp: new Date().toISOString()
  });
});

const transports = {};

app.post('/mcp', express.json(), async (req, res) => {
  try {
    if (!validateMcpSecret(req, res)) {
      return;
    }

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

app.get('/mcp', async (req, res) => {
  try {
    if (!validateMcpSecret(req, res)) {
      return;
    }

    const sessionId = req.headers['mcp-session-id'];
    const transport = sessionId ? transports[sessionId] : undefined;

    if (!transport) {
      res.status(400).send('Invalid or missing MCP session ID');
      return;
    }

    await transport.handleRequest(req, res);
  } catch (error) {
    console.error('MCP GET /mcp error:', error);

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

    const sessionId = req.headers['mcp-session-id'];
    const transport = sessionId ? transports[sessionId] : undefined;

    if (!transport) {
      res.status(400).send('Invalid or missing MCP session ID');
      return;
    }

    await transport.handleRequest(req, res);
  } catch (error) {
    console.error('MCP DELETE /mcp error:', error);

    if (!res.headersSent) {
      res.status(500).send('Internal server error');
    }
  }
});

const port = Number(process.env.MCP_SERVER_PORT || 3010);

app.listen(port, () => {
  console.log(`seo-api MCP server listening on port ${port}`);
});