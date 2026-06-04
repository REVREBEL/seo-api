# Repository Viability Matrix

This report evaluates 13 open-source repositories against the REVREBEL global workspace rules:
1. **License Firewall**: Enforcing permissive licenses only.
2. **Runtime Consolidation**: Standardizing on Playwright; rejecting conflicting headless runners (e.g., Puppeteer) due to Ubuntu/Chromium friction.
3. **Clean-Room Enforcement**: Prohibiting wholesale logic copying in favor of extracting specific arrays, patterns, and models.

| Repository | License & Compliance | Primary Language | Dependency Risk (Ubuntu/Chromium) | Recommended Strategy | Targeted REVREBEL Module |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **seo-skills/seo-audit-skill** | PASS (MIT) | TypeScript | **Low-Medium**: Native Playwright usage, aligns with consolidation. | **Clean-Room Extract**<br/>(Extract audit rules & logic) | `src/analyzers/technical-seo`<br/>`src/scoring/rules/` |
| **viasite/site-audit-seo** | PASS (MIT) | JavaScript | **Medium**: Lighthouse dependency (needs chrome-launcher config for Ubuntu). | **Clean-Room Extract**<br/>(Extract scoring models) | `src/services/lighthouse`<br/>`src/analyzers/technical-seo` |
| **zillow/seolint** | PASS (MIT) | JavaScript | **HIGH**: Puppeteer dependency creates headless runtime conflict. | **Clean-Room Extract**<br/>(Extract validation arrays/rules, reject runner) | `src/analyzers/content-seo`<br/>`src/scoring/rules/` |
| **JustinBeckwith/linkinator** | PASS (MIT) | TypeScript | **Low**: Native DOM parsing without heavy browsers. | **Clean-Room Extract**<br/>(Extract link traversal logic) | `src/services/link-check` |
| **iaincollins/structured-data-testing-tool** | PASS (ISC) | JavaScript | **Low**: No heavy browser engines. | **Clean-Room Extract**<br/>(Extract schema validation models) | `src/services/structured-data`<br/>`src/analyzers/schema` |
| **abhinaba-ghosh/playwright-lighthouse** | PASS (MIT) | JavaScript | **Low-Medium**: Bridging Playwright + Lighthouse. | **Clean-Room Extract**<br/>(Adapt bridge implementation) | `src/services/lighthouse` |
| **abhinaba-ghosh/axe-playwright** | PASS (MIT) | TypeScript | **Low-Medium**: Playwright native Axe injection. | **Clean-Room Extract**<br/>(Extract injection scripts) | `src/services/accessibility`<br/>`src/analyzers/accessibility` |
| **pa11y/pa11y** | PASS (MIT) | JavaScript | **HIGH**: Puppeteer + Axe/HTML_CodeSniffer conflicts with Playwright rule. | **Clean-Room Extract**<br/>(Extract a11y standards/rules, reject runner) | `src/analyzers/accessibility` |
| **danielsogl/lighthouse-mcp-server** | PASS (MIT) | TypeScript | **Medium**: Lighthouse dependency (needs headless config mapping). | **Clean-Room Extract**<br/>(Extract LH configuration params) | `src/services/lighthouse` |
| **useflyyer/robots** | PASS (MIT) | TypeScript | **Low**: Lightweight text parser. | **Clean-Room Extract**<br/>(Extract parsing syntax logic) | `src/services/robots` |
| **evanderkoogh/node-sitemap-stream-parser** | PASS (MIT) | JavaScript | **Low**: Stream processing, no headless dependencies. | **Clean-Room Extract**<br/>(Extract stream parsing models) | `src/services/sitemap` |
| **developit/wappalyzer** | PASS (MIT) | JavaScript | **Low**: Heavy JSON/Regex dictionaries, no browser needed. | **Clean-Room Extract**<br/>(Extract regex technology patterns/dictionaries) | `src/services/technology-detection` |
| **sajjadeakbari/seokar** | PASS (MIT) | Python | **Low**: Python-based, no node module conflict but language mismatch. | **Clean-Room Extract**<br/>(Translate metrics logic to JS) | `src/analyzers/technical-seo`<br/>`src/scoring/rules/` |

## Summary of Findings

- **License Compliance**: All 13 repositories pass the License Firewall. We encountered zero GPL/AGPL flags; all use permissive MIT or ISC licenses.
- **Runtime Friction**: Projects like **seolint** and **pa11y** introduce Puppeteer. To maintain Playwright consolidation and avoid double headless browser overhead on the Ubuntu server, we must strictly decouple their rule engines from their runners.
- **Clean-Room Enforcement**: To adhere to strict clean-room policies, the overarching strategy across the board is **Clean-Room Extract**. We will port patterns, JSON arrays, and scoring algorithms over natively into our own JavaScript/JSON files rather than integrating NPM modules directly.
