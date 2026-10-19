# RAG Bench

**改了检索方法，效果到底有没有提升？** An offline, dependency-free evaluation CLI for retrieval, citations and abstention, with reproducible paired bootstrap comparisons.

Node.js **22.14+**，无模型、无 API Key、无第三方依赖。接受问答标注和系统运行的 JSONL，生成 JSON 与 Markdown 报告。适合学习如何给 AI 应用建立可重复的质量标准。

## 运行示例

```sh
git clone https://github.com/hxl-0926/rag-bench.git
cd rag-bench
node src/cli.mjs evaluate examples/questions.jsonl examples/baseline.jsonl baseline-report.json 3
node src/cli.mjs evaluate examples/questions.jsonl examples/candidate.jsonl candidate-report.json 3
node src/cli.mjs compare baseline-report.json candidate-report.json
npm test
```

每次 evaluate 写出指定 JSON，以及同名加 `.md` 的可读报告。比较输出各指标的平均差与 95% percentile paired-bootstrap 区间。示例中 baseline/candidate、延迟都是**手工构造的合成数据**，仅用于检查流程，不是模型跑分或真实性能结论。

## 接入自己的系统

标注文件每行：

```json
{"id":"q1","query":"如何避免重复请求？","relevant":["idempotency"]}
```

系统运行文件每行：

```json
{"id":"q1","retrieved":["idempotency","transactions"],"citations":["idempotency"],"abstained":false,"latencyMs":12.5}
```

`relevant`、`retrieved`、`citations` 使用同一套文档或片段 ID。无法回答的问题用空的 `relevant` 数组。每个问题必须恰好对应一条运行记录；缺失、额外、重复 ID、负延迟、无效字段直接报错。重复返回的检索 ID 去重后参与排名，避免重复命中拉高分数。

评测器不运行模型，也不测量延迟；`latencyMs` 由你的系统在实际查询外层计时。模型错误应该作为失败记录呈现，例如空检索和拒答，而不是删除该样本。CLI 不包含 LLM judge，避免把不可复现的模型偏好混进确定性指标。

## 指标定义

| 指标 | 本项目约定 |
| --- | --- |
| Recall@k | 前 k 个去重结果的相关命中数 / 全部相关 ID 数 |
| MRR@k | 第一个相关结果排名的倒数，再对可回答问题平均 |
| MAP@k | 每个相关命中位置的 Precision 求和 / min(k, 相关 ID 数)，再平均 |
| nDCG@k | 二值相关性折损收益 / 理想排名收益 |
| Citation precision | 正确引用 ID 数 / 全部去重引用 ID 数；应引用却未引用记 0 |
| Citation recall | 正确引用 ID 数 / 相关 ID 数 |
| Abstention accuracy | 可回答问题未拒答，或不可回答问题拒答，计为正确 |
| p95 latency | 最近秩法：排序后第 ceil(0.95 × N) 项 |

无答案样本的排名指标、citation recall 为 `null`，从各自宏平均中排除；无答案且不引用的 citation precision 记 1。所有引用指标都评估全部引用，无前 k 截断。

引用 ID 命中仅说明引用集合与标注一致，**不代表回答内容得到原文支持**。还需人工检查事实、完整性与适当拒答。

## 比较可信度

报告保存数据集指纹：问题 ID、文本、排序后的相关标注。比较要求相同指纹与 k，并按问题 ID 对齐，不受行顺序影响。默认 2000 次有放回成对抽样、固定种子 42；每次抽样保留同一问题的 baseline/candidate 配对。

小样本区间很不稳定；该方法没有处理问题组间相关性，也未做多重比较修正。请为真实任务单独建立留出集，按课程、文档或用户分组，并报告样本量。确定性重现不等于统计结论可靠。

`npm test` 包含手算指标、重复结果、缺失数据、无答案样本、bootstrap 重现性与报告对齐测试。CI 配置覆盖 Windows/Linux、Node 22/24，状态以 Actions 为准。

阅读 [学习路线](docs/LEARNING.md)。MIT License；初始实现有 AI 协助。
