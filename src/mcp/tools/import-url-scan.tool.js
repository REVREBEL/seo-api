import { z } from "zod";
import { importUrlScan } from "../seo-api-client.js";

export const importUrlScanTool = {
  name: "import_url_scan",
  description:
    "Import a completed Cloudflare-style URL scanner JSON payload. The full raw scanner output is preserved for later review and benchmarking.",
  input: z
    .object({
      sourceProvider: z.string().optional().default("cloudflare"),
      scan: z.record(z.any()).optional(),
      raw: z.record(z.any()).optional(),
    })
    .catchall(z.any()),
  run: async (args) => {
    try {
      let payload;

      if (args.scan) {
        payload = {
          sourceProvider: args.sourceProvider || "cloudflare",
          scan: args.scan,
        };
      } else if (args.raw) {
        payload = args.raw;
      } else {
        payload = args;
      }

      return await importUrlScan(payload);
    } catch (error) {
      return {
        success: false,
        error: "import_url_scan failed",
        message: error?.message || "Unknown error",
      };
    }
  },
};
