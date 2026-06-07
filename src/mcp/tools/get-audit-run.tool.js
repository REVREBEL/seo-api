import { z } from "zod";
import { getAuditRun as getAuditRunApiClient } from "../seo-api-client.js";

export const getAuditRunTool = {
  name: "get_audit_run",
  description: "Retrieve a previously completed or failed SEO audit execution by auditId. Use this to recover prior work, continue after a disconnected session, or reference a specific previous audit result.",
  input: z.object({
    auditId: z.string().uuid(),
  }),
  run: async ({ auditId }) => {
    try {
      const result = await getAuditRunApiClient(auditId);
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
