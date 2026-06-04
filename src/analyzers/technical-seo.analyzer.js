import * as cheerio from 'cheerio';

export function analyzeTechnicalSeo(htmlString, targetUrl, robotsParser) {
  const report = {
    isRobotsAllowed: true,
    title: null,
    description: null,
    canonical: null,
    isCanonicalValid: false,
    h1Count: 0,
    missingImgAltCount: 0,
    isNoindexPresent: false
  };

  if (!htmlString) return report;
  const $ = cheerio.load(htmlString);

  if (robotsParser && targetUrl) {
    report.isRobotsAllowed = robotsParser.isAllowed(targetUrl, 'REVREBEL-Bot');
  }

  report.title = $('title').text().trim() || null;
  report.description = $('meta[name="description"]').attr('content')?.trim() || null;
  
  const canonical = $('link[rel="canonical"]').attr('href')?.trim() || null;
  report.canonical = canonical;
  if (canonical && targetUrl) {
    report.isCanonicalValid = (canonical === targetUrl);
  }

  report.h1Count = $('h1').length;
  
  $('img').each((_, el) => {
    if (!$(el).attr('alt')) report.missingImgAltCount++;
  });

  if (($('meta[name="robots"]').attr('content') || '').toLowerCase().includes('noindex')) {
    report.isNoindexPresent = true;
  }

  return report;
}