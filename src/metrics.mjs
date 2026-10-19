import { createHash } from 'node:crypto';
function unique(values) { return [...new Set(values)]; }

export function rankingMetrics(retrieved, relevant, k = 5) {
  if (!Number.isInteger(k) || k < 1 || k > 1000) throw new Error('k must be 1..1000');
  const ranked = unique(retrieved).slice(0, k), truth = new Set(relevant);
  if (!truth.size) return { recall: null, reciprocalRank: null, averagePrecision: null, ndcg: null };
  let hits = 0, reciprocalRank = 0, ap = 0, dcg = 0;
  ranked.forEach((id, i) => {
    if (truth.has(id)) {
      hits++;
      if (!reciprocalRank) reciprocalRank = 1 / (i + 1);
      ap += hits / (i + 1);
      dcg += 1 / Math.log2(i + 2);
    }
  });
  const ideal = Array.from({ length: Math.min(k, truth.size) }, (_, i) => 1 / Math.log2(i + 2)).reduce((a, b) => a + b, 0);
  return { recall: hits / truth.size, reciprocalRank, averagePrecision: ap / Math.min(k, truth.size), ndcg: dcg / ideal };
}

export function citationMetrics(cited, relevant) {
  const citations = unique(cited), truth = new Set(relevant);
  const correct = citations.filter(id => truth.has(id)).length;
  return { citationPrecision: citations.length ? correct / citations.length : truth.size ? 0 : 1, citationRecall: truth.size ? correct / truth.size : null };
}

function strings(values) { return Array.isArray(values) && values.every(x => typeof x === 'string' && x.length > 0); }
export function validateCases(cases) {
  if (!Array.isArray(cases) || !cases.length) throw new Error('Dataset must contain at least one case');
  const ids = new Set();
  for (const c of cases) {
    if (typeof c.id !== 'string' || !c.id || ids.has(c.id) || typeof c.query !== 'string' || !strings(c.relevant)) throw new Error('Cases need unique IDs, query and relevant string arrays');
    if (new Set(c.relevant).size !== c.relevant.length) throw new Error(`Duplicate relevance labels: ${c.id}`);
    ids.add(c.id);
  }
  return cases;
}
export function validateRun(run, cases) {
  if (!Array.isArray(run) || run.length !== cases.length) throw new Error('Run must contain exactly one result per case');
  const expected = new Set(cases.map(c => c.id)), seen = new Set();
  for (const row of run) {
    if (!expected.has(row.id) || seen.has(row.id) || !strings(row.retrieved) || !strings(row.citations) || typeof row.abstained !== 'boolean' || !Number.isFinite(row.latencyMs) || row.latencyMs < 0) throw new Error('Invalid, duplicate or unknown run row');
    seen.add(row.id);
  }
  return run;
}
export function evaluate(cases, run, k = 5) {
  validateCases(cases); validateRun(run, cases);
  const rows = new Map(run.map(r => [r.id, r]));
  const details = cases.map(c => {
    const row = rows.get(c.id);
    return { id: c.id, answerable: c.relevant.length > 0, ...rankingMetrics(row.retrieved, c.relevant, k), ...citationMetrics(row.citations, c.relevant), abstentionCorrect: Number(row.abstained === (c.relevant.length === 0)), latencyMs: row.latencyMs };
  });
  const mean = key => {
    const values = details.map(d => d[key]).filter(x => x !== null);
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  };
  const latencies = details.map(d => d.latencyMs).sort((a, b) => a - b);
  const summary = Object.fromEntries(['recall', 'reciprocalRank', 'averagePrecision', 'ndcg', 'citationPrecision', 'citationRecall', 'abstentionCorrect'].map(key => [key, mean(key)]));
  const labels = cases.map(({ id, query, relevant }) => ({ id, query, relevant: [...relevant].sort() })).sort((a, b) => a.id.localeCompare(b.id));
  const datasetHash = createHash('sha256').update(JSON.stringify(labels)).digest('hex');
  return { version: 1, datasetHash, k, count: details.length, answerableCount: details.filter(d => d.answerable).length, summary: { ...summary, p95LatencyMs: latencies[Math.ceil(latencies.length * 0.95) - 1] }, details };
}

// Seeded paired bootstrap. Resampling preserves baseline/candidate case pairs.
export function bootstrapDelta(before, after, { samples = 2000, seed = 42 } = {}) {
  if (!before.length || before.length !== after.length || [...before, ...after].some(x => !Number.isFinite(x))) throw new Error('Bootstrap needs equal non-empty finite numeric arrays');
  if (!Number.isInteger(samples) || samples < 20 || samples > 100_000) throw new Error('samples must be 20..100000');
  let state = seed >>> 0;
  const random = () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
  const deltas = after.map((value, i) => value - before[i]), draws = [];
  for (let s = 0; s < samples; s++) {
    let sum = 0;
    for (let i = 0; i < deltas.length; i++) sum += deltas[Math.floor(random() * deltas.length)];
    draws.push(sum / deltas.length);
  }
  draws.sort((a, b) => a - b);
  return { meanDelta: deltas.reduce((a, b) => a + b, 0) / deltas.length, lower95: draws[Math.floor(samples * 0.025)], upper95: draws[Math.min(samples - 1, Math.ceil(samples * 0.975) - 1)], seed, samples };
}

export function compareReports(before, after) {
  if (!before.datasetHash || before.datasetHash !== after.datasetHash) throw new Error('Reports must use identical dataset labels and questions');
  if (before.k !== after.k) throw new Error('Cannot compare reports with different k');
  if (before.details.length !== after.details.length) throw new Error('Reports must contain identical cases');
  const rows = new Map(after.details.map(d => [d.id, d]));
  if (before.details.some(d => !rows.has(d.id))) throw new Error('Reports must contain identical cases');
  const result = {};
  for (const key of ['recall', 'reciprocalRank', 'averagePrecision', 'ndcg', 'citationPrecision', 'citationRecall', 'abstentionCorrect']) {
    const pairs = before.details.map(d => [d[key], rows.get(d.id)[key]]).filter(([a, b]) => a !== null && b !== null);
    result[key] = pairs.length ? bootstrapDelta(pairs.map(p => p[0]), pairs.map(p => p[1])) : null;
  }
  return result;
}
