import { z } from "zod";
import { auditSeoPage as auditSeoPageApiClient } from "../seo-api-client.js";

export const auditSeoPageTool = {
  name: "audit_seo_page",
  description: "Run a website SEO and hotel-commercial health audit for a single URL. Returns a persistent auditId and structured audit result. Use this when a user asks to audit a website, inspect a hotel site, or generate SEO health data for a specific page.",
  input: z.object({
    url: z.string().url(),
    renderMode: z.enum(["static", "browser"]).optional().default("static"),
    includePerformance: z.boolean().optional().default(false),
    includeAccessibility: z.boolean().optional().default(false),
    viewport: z.enum(["desktop", "tablet", "mobile"]).optional().default("desktop"),
  }),
  run: async (payload) => {
    try {
      const result = await auditSeoPageApiClient(payload);
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
