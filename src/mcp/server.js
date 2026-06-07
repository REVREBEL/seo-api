import { createMcpServer } from "@modelcontextprotocol/sdk";
import { createServer } from "http";
import { auditSeoPageTool } from "./tools/audit-seo-page.tool.js";
import { getAuditRunTool } from "./tools/get-audit-run.tool.js";
import { listAuditRunsTool } from "./tools/list-audit-runs.tool.js";

const mcpServer = createMcpServer({
  tools: [auditSeoPageTool, getAuditRunTool, listAuditRunsTool],
  // security options if needed
});

const httpServer = createServer((req, res) => {
  if (req.url === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "UP",
        service: "seo-api-mcp",
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  if (req.url === "/mcp" && req.method === "POST") {
    mcpServer.handleRequest(req, res);
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
});

const port = process.env.MCP_SERVER_PORT || 3010;
httpServer.listen(port, () => {
  console.log(`MCP server listening on port ${port}`);
});
