---
schema_version: 1
id: "ai_news-2026-10-07"
category: "ai_news"
date: "2026-10-07"
title: "DailyInfo ai_news briefing"
generated_at: "2026-10-07T04:30:27.403117+08:00"
published_at: "2026-10-07T04:30:27.403117+08:00"
item_ids: ["latentspace-bea21f3b284d12a623ab116d"]
---
# AI Daily Digest - 2026-10-07

## [AINews] Reflection Beam - 501B-A23B American Open Model

## 🧠 模型进展
- Reflection 发布 Beam，501B 总参数/23B 激活的文本 MoE，面向编程、Agent 和科学工作，Apache 2.0 全权重预计本月发布。
- Beam 使用 23.8T 预训练 token（含数亿 PDF 的 OCR 数据），并在约 10,500 台 GB300 上各进行约四周预训练和 RL，自报 SWE-bench Verified 80.9。
- Aleph Alpha 发布 Kolibri，78B 总参数/3.46B 激活、Apache 2.0、面向德英双语，自报 AIME 2025 96.9%、GPQA Diamond 84.3%、SWE-bench Verified 66.4%。
- Reka 发布 Rho-1，19B 全模态模型，可理解和生成文本、图像、视频及机器人动作，320 张 H100 约三个月从零训练。
- Command Code 的 Agr 与 Agr-flash 以及 TypeSafe 的 Jev 采用无文本生成、返回类型化概率的决策模型，主要用于工具调用和路由。

## 🤖 Agent/产品进展
- Hugging Face 推出多 harness RL 方案，把 10 个未修改 harness 变成 RL 环境，跨 4 个 harness 训练将 LFM2.5-2.6B 首次解决率从 42% 提升到 54%。
- Cognition 推出 Devin 的 Dreaming 夜间记忆图剪枝与链接功能，并开源 git 和 markdown 支持的 Agent Memory Repo 格式。
- Cursor SDK 新增运行中转向、后台子代理回报父代理、可替换系统提示，以及 MCP 自定义工具的 readOnlyHint 和 destructiveHint 注解。
- Cline 的 Pareto 26.10 Preview 可跨模型路由并给答案评分，声称在相同 DeepSWE 分数下把每任务成本从 13.41 美元降至 0.24 美元。
- OpenAI 将 GPT-6 Astra 和 GPT-6.1 Sol 订阅默认速度提升约 50%，Codex 负责人承诺连续 28 天每天带来实质改进或完整重置。

## 🔬 AI for Science
- Vals AI 报告 90 多个 Opus 5.5 代理运行 3 天 DFT 模拟，标记两个室温磁性半导体候选，其中一个 1999 年已合成，但结果仅为预测并附公开账本。
- Reflection 的 Beam 明确面向科学工作负载，并用 OCR 管道处理数亿 PDF 作为 23.8T 预训练 token 的一部分。
- Reka Rho-1 可生成机器人动作，为具身智能和科学实验自动化提供新的全模态基座。

## 🏭 产业新闻
- AMD 据报道以 82 亿美元收购 World Labs。
- 腾讯据 FT 在 Oracle 东南亚数据中心租赁约 10 万颗先进芯片，五年约 70 亿美元；美国检方另指控加州经销商向中国走私超 3 亿美元 GPU 服务器。
- OpenAI 将在欧盟 AI 法案下为 ChatGPT 和 Codex 文本添加隐形统计水印，并在全球提供可选 API 开关。
- SemiAnalysis 测试称 Claude 订阅的 API 等值价值是 OpenAI 计划的 5 倍以上，但按任务成本调整后缩小至 1.3–2.9 倍。
- The Information 报道微软将内部 Anthropic 支出预期削减超过三分之一，Meta 的 Claude Code 用户从约 6 万降至 3 万。

[查看原文](https://www.latent.space/p/ainews-reflection-beam-501b-a23b)
