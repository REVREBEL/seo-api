import { mkdtemp } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { validateUrlSecure } from '../utils/security.js';

const UNLIGHTHOUSE_PIN = 'unlighthouse-cli@^0.13';

export async function runUnlighthouseSiteAudit({
  targetUrl,
  device = 'mobile',
  maxRoutes = 200,
  outputDir = null,
  timeoutMs = 600000
}) {
  if (!targetUrl || !validateUrlSecure(targetUrl)) {
    return { ok: false, error: `Invalid or blocked target URL: ${targetUrl}` };
  }

  if (!['mobile', 'desktop'].includes(device)) {
    return { ok: false, error: "device must be either 'mobile' or 'desktop'" };
  }

  const resolvedOutputDir = outputDir || await mkdtemp(path.join(tmpdir(), 'revrebel-unlighthouse-'));
  const scanner = Number.isFinite(Number(maxRoutes)) ? { maxRoutes: Number(maxRoutes) } : { maxRoutes: 200 };

  const args = [
    '--yes',
    '--package',
    UNLIGHTHOUSE_PIN,
    'unlighthouse-ci',
    '--site',
    targetUrl,
    '--device',
    device,
    '--output-path',
    resolvedOutputDir,
    '--build-static-files',
    '--scanner',
    JSON.stringify(scanner)
  ];

  const startedAt = new Date().toISOString();
  const proc = await runProcess('npx', args, timeoutMs);
  const summaryPath = path.join(resolvedOutputDir, 'ci-result.json');
  let summary = {};
  let summaryError = null;

  if (existsSync(summaryPath)) {
    try {
      summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
    } catch (error) {
      summaryError = `ci-result.json invalid JSON: ${error.message}`;
    }
  }

  return {
    ok: proc.exitCode === 0 && !summaryError,
    exitCode: proc.exitCode,
    targetUrl,
    outputDir: resolvedOutputDir,
    collection: {
      collectorVersion: 'revrebel-seo-api/unlighthouse-collector-1.0.0',
      package: UNLIGHTHOUSE_PIN,
      device,
      maxRoutes: scanner.maxRoutes,
      startedAt,
      completedAt: new Date().toISOString(),
      timeoutMs
    },
    summary,
    summaryError,
    stdoutTail: proc.stdout.slice(-2000),
    stderrTail: proc.stderr.slice(-2000),
    error: proc.error || summaryError || null
  };
}

function runProcess(command, args, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let finished = false;

    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      child.kill('SIGTERM');
      resolve({ exitCode: null, stdout, stderr, error: `${command} timed out after ${timeoutMs}ms` });
    }, timeoutMs);

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    child.on('error', (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({ exitCode: null, stdout, stderr, error: `${command} failed: ${error.message}` });
    });

    child.on('close', (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({ exitCode: code, stdout, stderr, error: null });
    });
  });
}
