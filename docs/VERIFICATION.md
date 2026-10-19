# 验证记录

2026-10-19，在 Windows、Node.js v22.14.0 上执行：

- `node --test`：6 项测试通过。
- 对自带 baseline 与 candidate JSONL 分别生成 JSON/Markdown 报告，compare 输出成对 bootstrap 区间。
- 接收 evidence-rag 实际执行产生的 7 条检索记录，完成文件级检索与拒答指标计算。

examples 中的两组运行记录和延迟均为手工构造；knowledge-base 交叉验证也只覆盖演示资料，不是模型性能基准。远端多平台 CI 结果以 GitHub Actions 为准。
