export function analyzeHotelCommercial(structuredData, detectedTechs = []) {
  const report = {
    hospitalitySchemaDetected: false,
    schemaTypesFound: [],
    bookingEngineDetected: false,
    bookingProvider: null,
    hasSocialMetadata: false,
    hasLanguageTags: false
  };

  if (!structuredData) return report;

  const allSchemas = [...(structuredData.jsonLd || []), ...(structuredData.microdata || [])];
  const targetTypes = ['Hotel', 'LodgingBusiness', 'Resort', 'Motel'];

  allSchemas.forEach(schema => {
    const type = schema?.['@type'];
    if (type) {
      if (Array.isArray(type)) report.schemaTypesFound.push(...type);
      else report.schemaTypesFound.push(type);
    }
  });

  report.schemaTypesFound = Array.from(new Set(report.schemaTypesFound));
  report.hospitalitySchemaDetected = report.schemaTypesFound.some(t => targetTypes.includes(t));

  const providers = ['SynXis (Sabre Hospitality)', 'Amadeus (iHotelier)'];
  const matchedTech = detectedTechs.find(t => providers.includes(t));
  if (matchedTech) {
    report.bookingEngineDetected = true;
    report.bookingProvider = matchedTech;
  }

  report.hasSocialMetadata = Object.keys(structuredData.openGraph || {}).length > 0;
  report.hasLanguageTags = !!(structuredData.metaTags?.['og:locale'] || structuredData.metaTags?.['language']);

  return report;
}