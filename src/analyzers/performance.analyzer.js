/**
 * Performance Analyzer
 * Processes raw programmatic Lighthouse metrics down to absolute 
 * threshold checkpoints for Core Web Vitals tracking.
 */

/**
 * Normalizes Lighthouse performance metrics for scoring evaluation.
 * @param {Object} lighthousePerformanceResult - The performance category wrapper from lighthouse.service.js.
 * @returns {Object} Structured Performance Audit sub-report.
 */
export function analyzePerformance(lighthousePerformanceResult) {
  const report = {
    auditedAt: new Date().toISOString(),
    rawScore: lighthousePerformanceResult?.score ?? 0,
    metrics: {
      speedIndex: { passed: false, value: null },
      largestContentfulPaint: { passed: false, value: null },
      cumulativeLayoutShift: { passed: false, value: null },
      totalBlockingTime: { passed: false, value: null }
    }
  };

  if (!lighthousePerformanceResult || !lighthousePerformanceResult.metrics) {
    return { ...report, error: 'No usable Lighthouse data available for processing.' };
  }

  const rawMetrics = lighthousePerformanceResult.metrics;

  // Isolate target metrics and run baseline threshold evaluations
  rawMetrics.forEach(metric => {
    switch (metric.id) {
      case 'speed-index':
        report.metrics.speedIndex.value = metric.displayValue;
        report.metrics.speedIndex.passed = (metric.score >= 0.9); // Excellent tier matching Lighthouse standards
        break;
      case 'largest-contentful-paint':
        report.metrics.largestContentfulPaint.value = metric.displayValue;
        report.metrics.largestContentfulPaint.passed = (metric.score >= 0.7); // Green/Needs Improvement boundary
        break;
      case 'cumulative-layout-shift':
        report.metrics.cumulativeLayoutShift.value = metric.displayValue;
        report.metrics.cumulativeLayoutShift.passed = (metric.score >= 0.9); // Highly visually stable
        break;
      case 'total-blocking-time':
        report.metrics.totalBlockingTime.value = metric.displayValue;
        report.metrics.totalBlockingTime.passed = (metric.score >= 0.7);
        break;
    }
  });

  return report;
}