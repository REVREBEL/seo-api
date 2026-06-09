export function analyzeLinkGraph(pages, options = {}) {
  const top = Number.isFinite(options.top) ? options.top : 10;
  const normalizedPages = normalizePages(pages);
  const nodes = normalizedPages.map((page) => page.url);
  const nodeSet = new Set(nodes);
  const depthByUrl = Object.fromEntries(normalizedPages.map((page) => [page.url, page.depth]));
  const titleByUrl = Object.fromEntries(normalizedPages.map((page) => [page.url, page.title || '']));
  const inDegree = Object.fromEntries(nodes.map((node) => [node, 0]));
  const outEdges = {};

  for (const page of normalizedPages) {
    const seen = new Set();
    const targets = [];

    for (const target of page.linksOut) {
      if (!nodeSet.has(target) || target === page.url || seen.has(target)) continue;
      seen.add(target);
      targets.push(target);
      inDegree[target] += 1;
    }

    outEdges[page.url] = targets;
  }

  const outDegree = Object.fromEntries(nodes.map((node) => [node, outEdges[node]?.length || 0]));
  const orphans = nodes.filter((node) => inDegree[node] === 0 && depthByUrl[node] !== 0).sort();
  const deepPages = nodes.filter((node) => Number.isInteger(depthByUrl[node]) && depthByUrl[node] > 3).sort();
  const depthHistogram = buildDepthHistogram(nodes, depthByUrl);
  const pageRank = calculatePageRank(nodes, outEdges);
  const ranked = [...nodes].sort((a, b) => {
    const prDiff = (pageRank[b] || 0) - (pageRank[a] || 0);
    if (prDiff !== 0) return prDiff;
    const inDiff = inDegree[b] - inDegree[a];
    if (inDiff !== 0) return inDiff;
    return a.localeCompare(b);
  });

  return {
    summary: {
      pages: nodes.length,
      orphans: orphans.length,
      deepPages: deepPages.length,
      maxDepth: maxDepth(depthByUrl),
      totalInternalLinks: Object.values(outDegree).reduce((sum, value) => sum + value, 0)
    },
    depthHistogram,
    orphans,
    deepPages,
    degrees: Object.fromEntries(nodes.map((node) => [node, { in: inDegree[node], out: outDegree[node] }])),
    pagerank: Object.fromEntries(nodes.map((node) => [node, round(pageRank[node] || 0)])),
    top: ranked.slice(0, Math.max(0, top)).map((url) => ({
      url,
      pagerank: round(pageRank[url] || 0),
      in: inDegree[url],
      out: outDegree[url],
      depth: depthByUrl[url],
      title: titleByUrl[url]
    }))
  };
}

function normalizePages(pages) {
  if (!Array.isArray(pages)) return [];
  return pages
    .filter((page) => page && typeof page.url === 'string' && page.url)
    .map((page) => ({
      url: page.url,
      status: page.status ?? page.statusCode ?? null,
      depth: Number.isInteger(page.depth) ? page.depth : null,
      title: page.title || '',
      linksOut: Array.isArray(page.links_out) ? page.links_out.filter((value) => typeof value === 'string') :
        Array.isArray(page.linksOut) ? page.linksOut.filter((value) => typeof value === 'string') : []
    }));
}

function calculatePageRank(nodes, outEdges, alpha = 0.85, maxIter = 100, tolerance = 1e-6) {
  const count = nodes.length;
  if (count === 0) return {};

  let scores = Object.fromEntries(nodes.map((node) => [node, 1 / count]));
  const uniform = 1 / count;
  const outDegree = Object.fromEntries(nodes.map((node) => [node, outEdges[node]?.length || 0]));

  for (let iteration = 0; iteration < maxIter; iteration += 1) {
    const last = scores;
    scores = Object.fromEntries(nodes.map((node) => [node, 0]));
    const danglingSum = alpha * nodes.filter((node) => outDegree[node] === 0).reduce((sum, node) => sum + last[node], 0);

    for (const node of nodes) {
      const degree = outDegree[node];
      if (!degree) continue;
      const share = alpha * last[node] / degree;
      for (const target of outEdges[node] || []) scores[target] += share;
    }

    for (const node of nodes) scores[node] += danglingSum * uniform + (1 - alpha) * uniform;
    const error = nodes.reduce((sum, node) => sum + Math.abs(scores[node] - last[node]), 0);
    if (error < count * tolerance) break;
  }

  return scores;
}

function buildDepthHistogram(nodes, depthByUrl) {
  const histogram = {};
  for (const node of nodes) {
    const depth = depthByUrl[node];
    const key = Number.isInteger(depth) ? String(depth) : 'unknown';
    histogram[key] = (histogram[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(histogram).sort(([a], [b]) => {
    if (a === 'unknown') return 1;
    if (b === 'unknown') return -1;
    return Number(a) - Number(b);
  }));
}

function maxDepth(depthByUrl) {
  const depths = Object.values(depthByUrl).filter(Number.isInteger);
  return depths.length ? Math.max(...depths) : null;
}

function round(value) {
  return Number(value.toFixed(6));
}
