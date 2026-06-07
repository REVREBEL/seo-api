import { z } from "zod";
import { runUrlScan } from "../seo-api-client.js";

export const runUrlScanTool = {
  name: "run_url_scan",
  description:
    "Run a new URL scanner request through seo-api. Initially supports Cloudflare provider-backed URL scanning.",
  input: z.object({
    url: z.string().url(),
    provider: z.string().optional().default("cloudflare"),
    waitForResult: z.boolean().optional().default(false),
  }),
  run: async (args) => {
    try {
      return await runUrlScan({
        url: args.url,
        provider: args.provider || "cloudflare",
        waitForResult: args.waitForResult ?? false,
      });
    } catch (error) {
      return {
        success: false,
        error: "run_url_scan failed",
        message: error?.message || "Unknown error",
      };
    }
  },
};
