function toNumberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function extractScoresForPersistence(auditResult) {
  const scorecard = auditResult?.scorecard || {};

  return {
    overallScore: toNumberOrNull(
      scorecard.overallScore ?? scorecard.overall ?? scorecard.score,
    ),
    technicalScore: toNumberOrNull(
      scorecard.technicalScore ??
        scorecard.technicalSeo ??
        auditResult?.technicalSeo?.score,
    ),
    hotelCommercialScore: toNumberOrNull(
      scorecard.hotelCommercialScore ??
        scorecard.hotelCommercial ??
        auditResult?.hotelCommercial?.score,
    ),
    performanceScore: toNumberOrNull(
      scorecard.performanceScore ??
        scorecard.performance ??
        auditResult?.performance?.score,
    ),
    accessibilityScore: toNumberOrNull(
      scorecard.accessibilityScore ??
        scorecard.accessibility ??
        auditResult?.accessibility?.score,
    ),
  };
}
