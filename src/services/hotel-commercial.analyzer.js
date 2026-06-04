/**
 * Hotel Commercial Analyzer
 * Analyzes structured semantic layers and tech stacks for hospitality business markers,
 * schema compliance, currency declarations, and reservation engine placement.
 */

/**
 * Evaluates the commercial visibility and transactional readiness of a hospitality site.
 * @param {Object} structuredDataResult - Output object from extractStructuredData service.
 * @param {Array<string>} detectedTechs - Array string names from detectTechnologies service.
 * @returns {Object} Structured Hotel Commercial Audit sub-report.
 */
export function analyzeHotelCommercial(structuredDataResult, detectedTechs = []) {
  const report = {
    auditedAt: new Date().toISOString(),
    hospitalitySchemaDetected: false,
    schemaTypesFound: [],
    bookingEngineTrace: { detected: false, provider: null },
    commercialMetadataScorecard: { hasOpenGraph: false, hasTwitterCard: false },
    localizationStatus: { hasLanguageTags: false, detectedLocale: null },
    readinessStatus: { readyForParityAudit: false }
  };

  if (!structuredDataResult) {
    return report;
  }

  // 1. Evaluate Semantic Hospitality Footprint
  const allSchemas = [...(structuredDataResult.jsonLd || []), ...(structuredDataResult.microdata || [])];
  
  const targetHospitalityTypes = ['Hotel', 'LodgingBusiness', 'Resort', 'Motel', 'BedAndBreakfast'];
  
  allSchemas.forEach(schema => {
    const type = schema?.['@type'];
    if (type) {
      if (Array.isArray(type)) {
        type.forEach(t => report.schemaTypesFound.push(t));
      } else {
        report.schemaTypesFound.push(type);
      }
    }
  });

  report.schemaTypesFound = Array.from(new Set(report.schemaTypesFound));
  report.hospitalitySchemaDetected = report.schemaTypesFound.some(type => 
    targetHospitalityTypes.includes(type)
  );

  // 2. Booking Engine Ingestion & Identification
  const transactionalProviders = ['SynXis (Sabre Hospitality)', 'Amadeus (iHotelier)', 'Shopify'];
  const match = detectedTechs.find(tech => transactionalProviders.includes(tech));
  
  if (match) {
    report.bookingEngineTrace.detected = true;
    report.bookingEngineTrace.provider = match;
  }

  // 3. Social Integration Check
  report.commercialMetadataScorecard.hasOpenGraph = Object.keys(structuredDataResult.openGraph || {}).length > 0;
  report.commercialMetadataScorecard.hasTwitterCard = Object.keys(structuredDataResult.twitter || {}).length > 0;

  // 4. Localization Extraction
  const metaTags = structuredDataResult.metaTags || {};
  const locale = metaTags['og:locale'] || metaTags['language'] || null;
  if (locale) {
    report.localizationStatus.hasLanguageTags = true;
    report.localizationStatus.detectedLocale = locale;
  }

  // 5. Audit Validation Check
  report.readinessStatus.readyForParityAudit = (
    report.hospitalitySchemaDetected && 
    report.bookingEngineTrace.detected
  );

  return report;
}