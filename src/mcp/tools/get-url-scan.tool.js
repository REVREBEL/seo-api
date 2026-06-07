import { z } from "zod";
import { getUrlScan } from "../seo-api-client.js";

export const getUrlScanTool = {
  name: "get_url_scan",
  description:
    "Retrieve a stored URL scanner result by scanId. Can optionally include the full raw scanner payload and normalized request rows.",
  input: z.object({
    scanId: z.string().uuid(),
    includeRaw: z.boolean().optional().default(false),
    includeRequests: z.boolean().optional().default(false),
  }),
  run: async (args) => {
    try {
      return await getUrlScan({
        scanId: args.scanId,
        includeRaw: args.includeRaw ?? false,
        includeRequests: args.includeRequests ?? false,
      });
    } catch (error) {
      return {
        success: false,
        error: "get_url_scan failed",
        message: error?.message || "Unknown error",
      };
    }
  },
};
