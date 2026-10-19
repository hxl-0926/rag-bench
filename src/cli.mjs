import { readFile, writeFile } from 'node:fs/promises';
import { evaluate, compareReports } from './metrics.mjs';

async function jsonl(file) {
  const lines = (await readFile(file, 'utf8')).replace(/^\uFEFF/, '').split(/\r?\n/);
  return lines.flatMap((line, i) => {
    if (!line.trim()) return [];
    try { return [JSON.parse(line)]; } catch { throw new Error(`${file}:${i + 1}: invalid JSON`); }
  });
}
export function markdown(report) {
  const lines = ['# RAG evaluation', '', `Cases: ${report.count}; answerable: ${report.answerableCount}; k: ${report.k}`, '', '| Metric | Value |', '| --- | ---: |'];
  for (const [key, value] of Object.entries(report.summary)) lines.push(`| ${key} | ${value === null ? 'N/A' : value.toFixed(4)} |`);
  lines.push('', 'Retrieval metrics exclude unanswerable cases. Citations measure ID overlap, not factual entailment. Latency is supplied by the run producer.', '');
  return lines.join('\n');
}
const [command, ...args] = process.argv.slice(2);
try {
  if (command === 'evaluate' && [3, 4].includes(args.length)) {
    const [dataset, runFile, output, k] = args;
    const report = evaluate(await jsonl(dataset), await jsonl(runFile), k === undefined ? 5 : Number(k));
    await writeFile(output, JSON.stringify(report, null, 2) + '\n');
    await writeFile(`${output}.md`, markdown(report));
    console.log(markdown(report));
  } else if (command === 'compare' && args.length === 2) {
    const reports = await Promise.all(args.map(async f => JSON.parse(await readFile(f, 'utf8'))));
    console.log(JSON.stringify(compareReports(...reports), null, 2));
  } else throw new Error('evaluate <dataset.jsonl> <run.jsonl> <report.json> [k] | compare <baseline.json> <candidate.json>');
} catch (error) { console.error(error.message); process.exitCode = 1; }
