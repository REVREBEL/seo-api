import { z } from "zod";
import { listUrlScans } from "../seo-api-client.js";

export const listUrlScansTool = {
  name: "list_url_scans",
  description:
    "List stored URL scanner runs by domain, apex domain, source provider, or recent history. Returns compact summaries only.",
  input: z.object({
    domain: z.string().optional(),
    apexDomain: z.string().optional(),
    sourceProvider: z.string().optional(),
    limit: z.number().int().positive().max(100).optional().default(10),
    offset: z.number().int().min(0).optional().default(0),
  }),
  run: async (args) => {
    try {
      return await listUrlScans({
        domain: args.domain,
        apexDomain: args.apexDomain,
        sourceProvider: args.sourceProvider,
        limit: args.limit ?? 10,
        offset: args.offset ?? 0,
      });
    } catch (error) {
      return {
        success: false,
        error: "list_url_scans failed",
        message: error?.message || "Unknown error",
      };
    }
  },
};
