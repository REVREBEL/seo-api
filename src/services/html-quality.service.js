const MAX_FINDINGS = 100;
const MAX_PER_CATEGORY_PER_FILE = 20;

export function analyzeHtmlQuality({ html, source = 'inline-html' }) {
  const content = String(html || '');
  const issues = [];
  const warnings = [];

  if (!content.trim()) {
    return {
      success: false,
      error: {
        type: 'invalid_input',
        message: 'No HTML content provided.',
        retryable: false,
        suggestion: 'Provide html or url to analyze.'
      }
    };
  }

  checkBasicDocumentEvidence(content, source, issues, warnings);
  checkImages(content, source, warnings);
  checkNonHttpsUrls(content, source, warnings);

  const issueCount = issues.length;
  const warningCount = warnings.length;

  return {
    success: true,
    source,
    issues: issues.slice(0, MAX_FINDINGS),
    warnings: warnings.slice(0, MAX_FINDINGS),
    issueCount,
    warningCount,
    truncated: issueCount > MAX_FINDINGS || warningCount > MAX_FINDINGS,
    limits: {
      maxFindings: MAX_FINDINGS,
      maxPerCategoryPerFile: MAX_PER_CATEGORY_PER_FILE
    }
  };
}

function checkBasicDocumentEvidence(content, source, issues, warnings) {
  if (!/<!doctype\s+html>/i.test(content)) issues.push(finding(source, 0, 'Missing HTML5 doctype'));
  if (!/charset[^>]*utf-8/i.test(content)) warnings.push(finding(source, 0, 'Missing or non-UTF-8 charset'));
  if (!/<meta\b[^>]*name=["']viewport["'][^>]*>/i.test(content)) issues.push(finding(source, 0, 'Missing viewport meta tag'));
  if (!/<html\b[^>]*\blang=/i.test(content)) issues.push(finding(source, 0, 'Missing lang attribute on <html>'));
  if (!/<title\b[^>]*>/i.test(content)) issues.push(finding(source, 0, 'Missing <title> tag'));
}

function checkImages(content, source, warnings) {
  let count = 0;
  for (const match of findTagMatches(content, /<img\b[^>]*>/gi)) {
    if (/\balt\s*=/i.test(match.text)) continue;
    if (count >= MAX_PER_CATEGORY_PER_FILE) {
      warnings.push(finding(source, 0, `<img>-without-alt findings truncated (>${MAX_PER_CATEGORY_PER_FILE} in this file)`));
      break;
    }
    warnings.push(finding(source, match.line, '<img> without alt attribute'));
    count += 1;
  }
}

function checkNonHttpsUrls(content, source, warnings) {
  let count = 0;
  for (const match of findTagMatches(content, /http:\/\/[^"'\s>]*/gi)) {
    if (count >= MAX_PER_CATEGORY_PER_FILE) {
      warnings.push(finding(source, 0, `Non-HTTPS URL findings truncated (>${MAX_PER_CATEGORY_PER_FILE} in this file)`));
      break;
    }
    warnings.push(finding(source, match.line, 'Non-HTTPS URL'));
    count += 1;
  }
}

function findTagMatches(content, regex) {
  const matches = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    matches.push({
      text: match[0],
      index: match.index,
      line: lineNumberForIndex(content, match.index)
    });
  }
  return matches;
}

function lineNumberForIndex(content, index) {
  let line = 1;
  for (let offset = 0; offset < index; offset += 1) {
    if (content.charCodeAt(offset) === 10) line += 1;
  }
  return line;
}

function finding(source, line, message) {
  return `${source}:${line}: ${message}`;
}
