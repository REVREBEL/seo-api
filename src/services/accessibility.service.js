/**
 * Accessibility Service
 * Implements an automated 'axe-core' injection strategy using Playwright.
 * Evaluates the rendered DOM for WCAG compliance and returns structured violation arrays.
 */

import AxeBuilder from '@axe-core/playwright';

/**
 * Injects the Axe-core accessibility engine directly into an active Playwright page.
 * @param {import('playwright').Page} page - The active Playwright page instance from render-html.service.js.
 * @param {Array<string>} tags - WCAG standard tags to evaluate against.
 * @returns {Promise<Array<Object>>} A clean array of standard violations (impact, description, helpUrl, nodes).
 */
export async function runAccessibilityAudit(page, tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']) {
  if (!page) {
    throw new Error('An active Playwright page instance is required to run the accessibility audit.');
  }

  try {
    // Inject and run axe-core directly into the provided Playwright page
    const results = await new AxeBuilder({ page })
      .withTags(tags)
      .analyze();

    // Map the complex axe-core output into our clean, standardized array format
    const cleanViolations = results.violations.map(violation => {
      return {
        id: violation.id,
        impact: violation.impact, // 'minor', 'moderate', 'serious', 'critical'
        description: violation.description,
        helpUrl: violation.helpUrl,
        nodes: violation.nodes.map(node => ({
          html: node.html,
          target: node.target, // Array of CSS selectors pointing to the problematic element
          failureSummary: node.failureSummary
        }))
      };
    });

    return cleanViolations;
  } catch (error) {
    console.error('[Accessibility] Error executing Axe-core injection:', error.message);
    throw error;
  }
}
