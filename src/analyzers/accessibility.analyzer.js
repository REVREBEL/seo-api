/**
 * Accessibility Analyzer
 * Consumes flat Axe-Core validation arrays, sorts failures by severity tiers,
 * and tracks element failure patterns.
 */

/**
 * Analyzes compliance violations.
 * @param {Array<Object>} axeViolations - Clean array structure from accessibility.service.js.
 * @returns {Object} Structured Accessibility Audit sub-report.
 */
export function analyzeAccessibility(axeViolations = []) {
  const report = {
    auditedAt: new Date().toISOString(),
    compliant: true,
    violationSummary: { critical: 0, serious: 0, moderate: 0, minor: 0 },
    criticalIssuesList: []
  };

  if (!Array.isArray(axeViolations) || axeViolations.length === 0) {
    return report; // Remains fully compliant
  }

  report.compliant = false;

  axeViolations.forEach(violation => {
    const impact = violation.impact; // 'minor', 'moderate', 'serious', 'critical'
    if (report.violationSummary[impact] !== undefined) {
      report.violationSummary[impact]++;
    }

    // Isolate critical items to populate tool call debug views
    if (impact === 'critical' || impact === 'serious') {
      report.criticalIssuesList.push({
        id: violation.id,
        description: violation.description,
        affectedElementsCount: violation.nodes?.length || 0,
        helpUrl: violation.helpUrl
      });
    }
  });

  return report;
}