import test from 'node:test';
import assert from 'node:assert/strict';
import { rankingMetrics, citationMetrics, evaluate, bootstrapDelta, compareReports } from '../src/metrics.mjs';

test('hand-calculated ranking metrics and duplicate robustness', () => {
  const m = rankingMetrics(['x', 'a', 'a', 'b'], ['a', 'b'], 3);
  assert.equal(m.recall, 1);
  assert.equal(m.reciprocalRank, 0.5);
  assert.equal(m.averagePrecision, (0.5 + 2 / 3) / 2);
  assert.ok(Math.abs(m.ndcg - ((1 / Math.log2(3) + 1 / 2) / (1 + 1 / Math.log2(3)))) < 1e-12);
  assert.equal(rankingMetrics([], ['a']).recall, 0);
  assert.equal(rankingMetrics(['a'], []).recall, null);
});
test('citation metrics distinguish missing, invented and irrelevant citations', () => {
  assert.deepEqual(citationMetrics(['a', 'fake', 'a'], ['a', 'b']), { citationPrecision: 0.5, citationRecall: 0.5 });
  assert.equal(citationMetrics([], ['a']).citationPrecision, 0);
  assert.equal(citationMetrics([], []).citationPrecision, 1);
});
const cases = [{ id: 'q1', query: 'q', relevant: ['a'] }, { id: 'q2', query: 'unknown', relevant: [] }];
const run = [{ id: 'q1', retrieved: ['a'], citations: ['a'], abstained: false, latencyMs: 2 }, { id: 'q2', retrieved: [], citations: [], abstained: true, latencyMs: 8 }];
test('macro averaging excludes unanswerable ranking cases', () => {
  const report = evaluate(cases, run);
  assert.equal(report.summary.recall, 1);
  assert.equal(report.summary.abstentionCorrect, 1);
  assert.equal(report.summary.p95LatencyMs, 8);
});
test('missing, duplicate and malformed data fail instead of inflating metrics', () => {
  assert.throws(() => evaluate(cases, run.slice(1)));
  assert.throws(() => evaluate(cases, [run[0], run[0]]));
  assert.throws(() => evaluate(cases, [{ ...run[0], latencyMs: -1 }, run[1]]));
  assert.throws(() => evaluate([cases[0], cases[0]], run));
  assert.throws(() => evaluate(cases, run, 0));
});
test('paired bootstrap is reproducible and detects constant deltas', () => {
  assert.deepEqual(bootstrapDelta([0, 0], [1, 1]), { meanDelta: 1, lower95: 1, upper95: 1, seed: 42, samples: 2000 });
  assert.deepEqual(bootstrapDelta([0.2, 0.3, 0.1], [0.3, 0.8, 0.4]), bootstrapDelta([0.2, 0.3, 0.1], [0.3, 0.8, 0.4]));
  assert.throws(() => bootstrapDelta([], []));
});
test('report comparison aligns cases by ID and rejects cutoff mismatches', () => {
  const a = evaluate(cases, run), b = evaluate(cases, [...run].reverse());
  assert.equal(compareReports(a, b).recall.meanDelta, 0);
  assert.throws(() => compareReports(a, { ...b, k: 3 }));
  const changedLabels = evaluate([{ ...cases[0], relevant: ['different'] }, cases[1]], run);
  assert.throws(() => compareReports(a, changedLabels), /identical dataset/);
});
