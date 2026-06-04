/**
 * Scorecard & Recommendation Engine
 * Consolidates individual analyzer reports against rule profiles to compute weighted
 * performance tracking numbers and prioritize mitigation tasks.
 */

import technicalSeoRules from './rules/technical-seo.rules.json' assert { type: 'json' };
import hotelCommercialRules from './rules/hotel-commercial.rules.json' assert { type: 'json' };

/**
 * Aggregates all analysis structures into a definitive commercial audit snapshot.
 * @param {Object} technicalReport - Output from technical-seo.analyzer.js.
 * @param {Object} commercialReport - Output from hotel-commercial.analyzer.js.
 * @returns {Object} A unified scorecard document containing scores and an issues backlog.
 */
export function generateScorecard(technicalReport, commercialReport) {
  const issueBacklog = [];
  
  // 1. Process Technical SEO Category Score
  const techScore = _calculateCategoryScore(
    technicalSeoRules,
    {
      isRobotsAllowed: technicalReport?.crawlProperties?.isRobotsAllowed ?? false,
      isNoindexPresent: !(technicalReport?.indexability?.isNoindexPresent ?? false), // Pass if NO noindex
      hasTitle: !!technicalReport?.metaEvaluation?.title,
      isCanonicalValid: technicalReport?.metaEvaluation?.isCanonicalValid ?? false,
      hasSingleH1: technicalReport?.structuralHealth?.h1Count === 1
    },
    issueBacklog
  );

  // 2. Process Hotel Commercial Category Score
  const commercialScore = _calculateCategoryScore(
    hotelCommercialRules,
    {
      bookingEngineDetected: commercialReport?.bookingEngineTrace?.detected ?? false,
      hospitalitySchemaDetected: commercialReport?.hospitalitySchemaDetected ?? false,
      hasLanguageTags: commercialReport?.localizationStatus?.hasLanguageTags ?? false,
      commercialMetadata: (commercialReport?.commercialMetadataScorecard?.hasOpenGraph && commercialReport?.commercialMetadataScorecard?.hasTwitterCard)
    },
    issueBacklog
  );

  // 3. Compute Cumulative Absolute Rating
  const globalScore = Math.round((techScore + commercialScore) / 2);

  // 4. Sort Recommendation Engine Backlog by impact priority
  const priorityWeight = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
  issueBacklog.sort((a, b) => priorityWeight[b.priority] - priorityWeight[a.priority]);

  return {
    generatedAt: new Date().toISOString(),
    globalCommercialScore: globalScore,
    categoryScores: {
      technicalSeo: techScore,
      hotelCommercial: commercialScore
    },
    recommendationQueue: issueBacklog
  };
}

/**
 * Evaluates pass/fail states against target schema configurations.
 * @private
 */
function _calculateCategoryScore(ruleProfile, states, issueBacklog) {
  let earnedPoints = 0;
  let totalPoints = 0;

  for (const [ruleKey, ruleConfig] of Object.entries(ruleProfile.rules)) {
    totalPoints += ruleConfig.weight;
    
    if (states[ruleKey] === true) {
      earnedPoints += ruleConfig.weight;
    } else {
      // Rule failure tracked, push to prioritized recommendations queue
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