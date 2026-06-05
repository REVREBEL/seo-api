
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

let allowedViewports = null;

export function getAllowedViewports() {
  if (allowedViewports) {
    return allowedViewports;
  }

  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const openApiSpecPath = resolve(__dirname, '../../public/openapi.json');
    const openApiSpec = JSON.parse(readFileSync(openApiSpecPath, 'utf8'));

    const viewports = openApiSpec?.paths?.['/api/audit']?.post?.requestBody?.content?.['application/json']?.schema?.properties?.viewport?.enum;

    if (!viewports || !Array.isArray(viewports)) {
        console.error('Error: Could not find or validate viewports in OpenAPI spec. Using default.');
        allowedViewports = new Set(['desktop', 'mobile']);
        return allowedViewports;
    }

    allowedViewports = new Set(viewports);
    return allowedViewports;
  } catch (error) {
    console.error('Failed to read or parse OpenAPI spec:', error);
    // Fallback to a default set of viewports if the spec is unavailable or malformed
    allowedViewports = new Set(['desktop', 'mobile']);
    return allowedViewports;
  }
}
