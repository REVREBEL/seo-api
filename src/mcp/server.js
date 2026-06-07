import { createMcpServer } from "@modelcontextprotocol/sdk/server/index.js";
import { createStreamableHttpServer } from "@modelcontextprotocol/sdk/server/http.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import { auditSeoPageTool } from "./tools/audit-seo-page.tool.js";
import { getAuditRunTool } from "./tools/get-audit-run.tool.js";
import { listAuditRunsTool } from "./tools/list-audit-runs.tool.js";
import { zodToJsonSchema } from "zod-to-json-schema";

const server = new createMcpServer(
  {
    name: "seo-api-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const tools = [auditSeoPageTool, getAuditRunTool, listAuditRunsTool];

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: zodToJsonSchema(tool.input),
    })),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const tool = tools.find((t) => t.name === name);
  if (!tool) {
    throw new Error(`Tool not found: ${name}`);
  }

  const parsed = tool.input.safeParse(args);
  if (!parsed.success) {
    return {
      content: [
        {
          type: "text",
          text: `Invalid input: ${parsed.error.message}`,
        },
      ],
      isError: true,
    };
  }

  try {
    const result = await tool.run(parsed.data);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error executing tool: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

const app = express();

app.get("/health", (req, res) => {
  res.json({
    status: "UP",
    service: "seo-api-mcp",
    timestamp: new Date().toISOString(),
  });
});

const mcpHttpServer = createStreamableHttpServer(server);

app.use("/mcp", express.json(), (req, res) => {
  const configuredSecret = process.env.MCP_SHARED_SECRET;
  if (configuredSecret) {
    const headerSecret = req.headers['x-mcp-secret'];
    if (!headerSecret || headerSecret !== configuredSecret) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden: invalid or missing x-mcp-secret' }));
      return;
    }
  }
  mcpHttpServer(req, res);
});

const port = process.env.MCP_SERVER_PORT || 3010;
app.listen(port, () => {
  console.log(`MCP server listening on port ${port}`);
});