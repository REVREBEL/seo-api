import technicalSeoRules from './rules/technical-seo.rules.json' assert { type: 'json' };
import hotelCommercialRules from './rules/hotel-commercial.rules.json' assert { type: 'json' };
import performanceRules from './rules/performance.rules.json' assert { type: 'json' };
import accessibilityRules from './rules/accessibility.rules.json' assert { type: 'json' };

export function generateScorecard(technicalReport, commercialReport, performanceReport, accessibilityReport) {
  const issueBacklog = [];
  const validCategoryScores = [];

  // 1. Always evaluate core matrices
  const techScore = _calculateCategoryScore(technicalSeoRules, {
    isRobotsAllowed: technicalReport?.isRobotsAllowed ?? false,
    isNoindexPresent: !(technicalReport?.isNoindexPresent ?? false),
    hasTitle: !!technicalReport?.title,
    isCanonicalValid: technicalReport?.isCanonicalValid ?? false,
    hasSingleH1: technicalReport?.h1Count === 1
  }, issueBacklog);
  validCategoryScores.push(techScore);

  const commercialScore = _calculateCategoryScore(hotelCommercialRules, {
    bookingEngineDetected: commercialReport?.bookingEngineDetected ?? false,
    hospitalitySchemaDetected: commercialReport?.hospitalitySchemaDetected ?? false,
    hasLanguageTags: commercialReport?.hasLanguageTags ?? false,
    commercialMetadata: commercialReport?.hasSocialMetadata ?? false
  }, issueBacklog);
  validCategoryScores.push(commercialScore);

  // 2. Dynamically apply optional audit scores
  let perfScore = null;
  if (performanceReport && !performanceReport.error) {
    perfScore = _calculateCategoryScore(performanceRules, {
      speedIndex: performanceReport.metrics?.speedIndex?.passed ?? false,
      largestContentfulPaint: performanceReport.metrics?.largestContentfulPaint?.passed ?? false,
      cumulativeLayoutShift: performanceReport.metrics?.cumulativeLayoutShift?.passed ?? false,
      totalBlockingTime: performanceReport.metrics?.totalBlockingTime?.passed ?? false
    }, issueBacklog);
    validCategoryScores.push(perfScore);
  }

  let a11yScore = null;
  if (accessibilityReport && !accessibilityReport.error) {
    a11yScore = _calculateCategoryScore(accessibilityRules, {
      criticalViolations: (accessibilityReport.violationSummary?.critical === 0),
      seriousViolations: (accessibilityReport.violationSummary?.serious === 0),
      moderateViolations: (accessibilityReport.violationSummary?.moderate === 0)
    }, issueBacklog);
    validCategoryScores.push(a11yScore);
  }

  // 3. Compute dynamic mathematical score average 
  const globalScore = Math.round(validCategoryScores.reduce((a, b) => a + b, 0) / validCategoryScores.length);
  issueBacklog.sort((a, b) => (b.impactLoss || 0) - (a.impactLoss || 0));

  return {
    globalCommercialScore: globalScore,
    categoryScores: {
      technicalSeo: techScore,
      hotelCommercial: commercialScore,
      performance: perfScore,
      accessibility: a11yScore
    },
    recommendationQueue: issueBacklog
  };
}

function _calculateCategoryScore(profile, states, backlog) {
  let earned = 0, total = 0;
  for (const [key, conf] of Object.entries(profile.rules)) {
    total += conf.weight;
    if (states[key]) earned += conf.weight;
    else {
      backlog.push({ category: profile.category, priority: conf.priority, impactLoss: conf.weight, recommendation: conf.errorMessage });
    }
  }
  return total === 0 ? 0 : Math.round((earned / total) * 100);
}