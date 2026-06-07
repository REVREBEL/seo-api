import { z } from "zod";
import { listAuditRuns as listAuditRunsApiClient } from "../seo-api-client.js";

export const listAuditRunsTool = {
  name: "list_audit_runs",
  description: "List recent SEO audit executions, optionally filtered by domain. Use this before rerunning an audit if the user asks about prior audits, benchmarking, trends, or recent results for a site.",
  input: z.object({
    domain: z.string().optional(),
    limit: z.number().int().max(100).optional().default(10),
    offset: z.number().int().optional().default(0),
  }),
  run: async (payload) => {
    try {
      const result = await listAuditRunsApiClient(payload);
      if (!result.success) {
        return {
          success: false,
          error: result.error || "API Error",
          message: result.message,
        };
      }
      return result;
    } catch (error) {
      return {
        success: false,
        error: "Tool Error",
        message: error.message,
      };
    }
  },
};
