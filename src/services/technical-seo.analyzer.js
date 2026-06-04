/**
 * Technical SEO Analyzer
 * Evaluates core indexability, crawl rules, schema presence, meta status, 
 * and tag structural health using service-ingested data blocks.
 */

import * as cheerio from 'cheerio';

/**
 * Executes a full technical evaluation over target asset states.
 * @param {Object} rawFetchResult - Output wrapper from fetchHtml service.
 * @param {Object} renderedResult - Output wrapper from renderHtml service.
 * @param {RobotsParser} robotsParser - An initialized instance of RobotsParser.
 * @returns {Object} Structured Technical SEO Audit sub-report.
 */
export function analyzeTechnicalSeo(rawFetchResult, renderedResult, robotsParser) {
  const htmlToAnalyze = renderedResult?.success ? renderedResult.html : rawFetchResult?.html;
  const targetUrl = renderedResult?.url || rawFetchResult?.url;
  
  const report = {
    auditedAt: new Date().toISOString(),
    targetUrl,
    crawlProperties: { isRobotsAllowed: true, status: rawFetchResult?.status || null },
    metaEvaluation: { title: null, description: null, canonical: null, isCanonicalValid: false },
    structuralHealth: { h1Count: 0, h1List: [], missingImgAltCount: 0 },
    indexability: { isNoindexPresent: false, passesTechnicalChecks: false }
  };

  if (!htmlToAnalyze) {
    return { ...report, error: 'No usable HTML structure found for analysis.' };
  }

  const $ = cheerio.load(htmlToAnalyze);

  // 1. Robots.txt Compliance Check
  if (robotsParser && targetUrl) {
    report.crawlProperties.isRobotsAllowed = robotsParser.isAllowed(targetUrl, 'Googlebot');
  }

  // 2. Meta Tag Evaluations
  report.metaEvaluation.title = $('title').text().trim() || null;
  report.metaEvaluation.description = $('meta[name="description"]').attr('content')?.trim() || null;
  
  const canonicalHref = $('link[rel="canonical"]').attr('href')?.trim() || null;
  report.metaEvaluation.canonical = canonicalHref;
  if (canonicalHref && targetUrl) {
    report.metaEvaluation.isCanonicalValid = (canonicalHref === targetUrl);
  }

  // 3. Structural Heading & Asset Auditing
  $('h1').each((_, el) => {
    report.structuralHealth.h1List.push($(el).text().trim());
  });
  report.structuralHealth.h1Count = report.structuralHealth.h1List.length;

  $('img').each((_, el) => {
    const alt = $(el).attr('alt');
    if (alt === undefined || alt === null) {
      report.structuralHealth.missingImgAltCount++;
    }
  });

  // 4. Indexability Analysis
  const robotsMeta = $('meta[name="robots"]').attr('content')?.toLowerCase() || '';
  if (robotsMeta.includes('noindex')) {
    report.indexability.isNoindexPresent = true;
  }

  report.indexability.passesTechnicalChecks = (
    report.crawlProperties.isRobotsAllowed &&
    !report.indexability.isNoindexPresent &&
    report.structuralHealth.h1Count === 1 &&
    !!report.metaEvaluation.title
  );

  return report;
}