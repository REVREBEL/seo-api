/**
 * Lighthouse Service
 * Runs programmatic Lighthouse and returns raw plus normalized evidence.
 */

import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';
import { chromium } from 'playwright';

export async function runLighthouseAudit(url, options = {}) {
  const chrome = await launch({
    chromePath: chromium.executablePath(),
    chromeFlags: [
      '--headless=new',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  });

  try {
    const lhOptions = {
      logLevel: 'error',
      output: 'json',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      port: chrome.port,
      ...options
    };

    const runnerResult = await lighthouse(url, lhOptions);
    const report = runnerResult.lhr;

    return {
      raw: report,
      normalized: normalizeLighthouseRun(report, 'navigation')
    };
  } catch (error) {
    console.error(`[Lighthouse] Audit failed for ${url}:`, error.message);
    throw error;
  } finally {
    await chrome.kill();
  }
}

export function normalizeLighthouseRun(run, modeFallback = 'navigation') {
  if (!run) return null;

  const auditRefIndex = new Map();
  for (const [categoryId, category] of Object.entries(run.categories || {})) {
    for (const ref of category?.auditRefs || []) {
      auditRefIndex.set(ref.id, {
        category: categoryId,
        group: ref.group ?? null,
        weight: typeof ref.weight === 'number' ? ref.weight : null
      });
    }
  }

  const audits = Object.entries(run.audits || {}).map(([id, audit]) => {
    const ref = auditRefIndex.get(id);
    const items = Array.isArray(audit?.details?.items) ? audit.details.items : [];
    const headings = Array.isArray(audit?.details?.headings) ? audit.details.headings : [];

    return {
      id,
      title: audit?.title ?? null,
      description: audit?.description ?? null,
      category: ref?.category ?? null,
      group: ref?.group ?? null,
      weight: ref?.weight ?? null,
      score: typeof audit?.score === 'number' ? audit.score : null,
      scoreDisplayMode: audit?.scoreDisplayMode ?? null,
      status: getAuditStatus(audit),
      numericValue: typeof audit?.numericValue === 'number' ? audit.numericValue : null,
      numericUnit: audit?.numericUnit ?? null,
      displayValue: audit?.displayValue ?? null,
      detailsType: audit?.details?.type ?? null,
      itemCount: items.length,
      headings,
      items,
      metricSavings: audit?.metricSavings ?? null,
      guidanceLevel: typeof audit?.guidanceLevel === 'number' ? audit.guidanceLevel : null,
      scoringOptions: audit?.scoringOptions ?? null,
      sourcePath: `lighthouse.${run.gatherMode || modeFallback}.audits.${id}`,
      raw: audit || {}
    };
  });

  return {
    meta: {
      lighthouseVersion: run.lighthouseVersion ?? null,
      requestedUrl: run.requestedUrl ?? null,
      mainDocumentUrl: run.mainDocumentUrl ?? null,
      finalDisplayedUrl: run.finalDisplayedUrl ?? null,
      finalUrl: run.finalUrl ?? run.finalDisplayedUrl ?? null,
      fetchTime: run.fetchTime ?? null,
      gatherMode: run.gatherMode ?? modeFallback,
      runWarnings: run.runWarnings ?? [],
      userAgent: run.userAgent ?? null,
      environment: run.environment ?? {},
      configSettings: run.configSettings ?? {}
    },
    categories: run.categories ?? {},
    categoryGroups: run.categoryGroups ?? {},
    audits,
    summary: summarizeAuditStatuses(audits),
    raw: run
  };
}

export function extractBrowserSignals(normalizedRun) {
  const byId = indexAuditsById(normalizedRun?.audits || []);
  return {
    consoleErrors: byId['errors-in-console']?.items || [],
    deprecations: byId.deprecations?.items || [],
    browserIssues: byId['inspector-issues']?.items || [],
    backForwardCache: byId['bf-cache']?.items || []
  };
}

export function extractNetworkSignals(normalizedRun) {
  const byId = indexAuditsById(normalizedRun?.audits || []);
  return {
    totalByteWeight: byId['total-byte-weight'] ?? null,
    networkRequests: byId['network-requests']?.items || [],
    renderBlockingRequests: byId['render-blocking-resources']?.items || [],
    thirdPartySummary: byId['third-party-summary']?.items || [],
    resourceSummary: byId['resource-summary']?.items || []
  };
}

function indexAuditsById(audits) {
  return Object.fromEntries(audits.map((audit) => [audit.id, audit]));
}

function getAuditStatus(audit) {
  if (!audit) return 'unknown';
  if (audit.scoreDisplayMode === 'manual') return 'manual';
  if (audit.scoreDisplayMode === 'notApplicable') return 'notApplicable';
  if (audit.scoreDisplayMode === 'informative') return 'informative';
  if (typeof audit.score === 'number') {
    if (audit.score >= 0.9) return 'pass';
    if (audit.score > 0 && audit.score < 0.9) return 'warning';
    if (audit.score === 0) return 'fail';
  }
  return 'unknown';
}

function summarizeAuditStatuses(audits) {
  const summary = {
    auditCount: audits.length,
    passedAuditIds: [],
    failedAuditIds: [],
    warningAuditIds: [],
    manualAuditIds: [],
    notApplicableAuditIds: [],
    informativeAuditIds: [],
    unknownAuditIds: []
  };

  for (const audit of audits) {
    if (audit.status === 'pass') summary.passedAuditIds.push(audit.id);
    else if (audit.status === 'fail') summary.failedAuditIds.push(audit.id);
    else if (audit.status === 'warning') summary.warningAuditIds.push(audit.id);
    else if (audit.status === 'manual') summary.manualAuditIds.push(audit.id);
    else if (audit.status === 'notApplicable') summary.notApplicableAuditIds.push(audit.id);
    else if (audit.status === 'informative') summary.informativeAuditIds.push(audit.id);
    else summary.unknownAuditIds.push(audit.id);
  }

  return summary;
}
