/**
 * Scorecard & Recommendation Engine
 * Consolidates individual analyzer reports against rule profiles to compute weighted
 * performance tracking numbers and prioritize mitigation tasks.
 */

import technicalSeoRules from './rules/technical-seo.rules.json' assert { type: 'json' };
import hotelCommercialRules from './rules/hotel-commercial.rules.json' assert { type: 'json' };
import performanceRules from './rules/performance.rules.json' assert { type: 'json' };
import accessibilityRules from './rules/accessibility.rules.json' assert { type: 'json' };

/**
 * Aggregates all analysis structures into a definitive commercial audit snapshot.
 */
export function generateScorecard(technicalReport, commercialReport, performanceReport, accessibilityReport) {
  const issueBacklog = [];
  
  // 1. Process Category Scores
  const techScore = _calculateCategoryScore(technicalSeoRules, {
    isRobotsAllowed: technicalReport?.crawlProperties?.isRobotsAllowed ?? false,
    isNoindexPresent: !(technicalReport?.indexability?.isNoindexPresent ?? false),
    hasTitle: !!technicalReport?.metaEvaluation?.title,
    isCanonicalValid: technicalReport?.metaEvaluation?.isCanonicalValid ?? false,
    hasSingleH1: technicalReport?.structuralHealth?.h1Count === 1
  }, issueBacklog);

  const commercialScore = _calculateCategoryScore(hotelCommercialRules, {
    bookingEngineDetected: commercialReport?.bookingEngineTrace?.detected ?? false,
    hospitalitySchemaDetected: commercialReport?.hospitalitySchemaDetected ?? false,
    hasLanguageTags: commercialReport?.localizationStatus?.hasLanguageTags ?? false,
    commercialMetadata: (commercialReport?.commercialMetadataScorecard?.hasOpenGraph && commercialReport?.commercialMetadataScorecard?.hasTwitterCard)
  }, issueBacklog);

  const perfScore = _calculateCategoryScore(performanceRules, {
    speedIndex: performanceReport?.metrics?.speedIndex?.passed ?? false,
    largestContentfulPaint: performanceReport?.metrics?.largestContentfulPaint?.passed ?? false,
    cumulativeLayoutShift: performanceReport?.metrics?.cumulativeLayoutShift?.passed ?? false,
    totalBlockingTime: performanceReport?.metrics?.totalBlockingTime?.passed ?? false
  }, issueBacklog);

  const a11yScore = _calculateCategoryScore(accessibilityRules, {
    criticalViolations: (accessibilityReport?.violationSummary?.critical === 0),
    seriousViolations: (accessibilityReport?.violationSummary?.serious === 0),
    moderateViolations: (accessibilityReport?.violationSummary?.moderate === 0)
  }, issueBacklog);

  // 2. Compute Global Averaged Score
  const globalScore = Math.round((techScore + commercialScore + perfScore + a11yScore) / 4);

  // 3. Sort Recommendation Engine Backlog by impact priority
  const priorityWeight = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
  issueBacklog.sort((a, b) => priorityWeight[b.priority] - priorityWeight[a.priority]);

  return {
    generatedAt: new Date().toISOString(),
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

function _calculateCategoryScore(ruleProfile, states, issueBacklog) {
  let earnedPoints = 0;
  let totalPoints = 0;

  for (const [ruleKey, ruleConfig] of Object.entries(ruleProfile.rules)) {
    totalPoints += ruleConfig.weight;
    
    if (states[ruleKey] === true) {
      earnedPoints += ruleConfig.weight;
    } else {
      issueBacklog.push({
        category: ruleProfile.category,
        ruleId: ruleKey,
        priority: ruleConfig.priority,
        impactLoss: ruleConfig.weight,
        recommendation: ruleConfig.errorMessage
      });
    }
  }

  if (totalPoints === 0) return 0;
  return Math.round((earnedPoints / totalPoints) * 100);
}