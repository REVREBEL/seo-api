import { z } from "zod";
import { refreshUrlScanResult } from "../seo-api-client.js";

export const refreshUrlScanResultTool = {
  name: "refresh_url_scan_result",
  description:
    "Refresh a provider-backed URL scan by retrieving the final scanner result and storing the full raw payload in seo-api.",
  input: z.object({
    scanId: z.string().uuid(),
  }),
  run: async (args) => {
    try {
      return await refreshUrlScanResult(args.scanId);
    } catch (error) {
      return {
        success: false,
        error: "refresh_url_scan_result failed",
        message: error?.message || "Unknown error",
      };
    }
  },
};
