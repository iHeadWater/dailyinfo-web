---
schema_version: 1
id: "ai_news-2026-10-09"
category: "ai_news"
date: "2026-10-09"
title: "DailyInfo ai_news briefing"
generated_at: "2026-10-09T04:30:31.900650+08:00"
published_at: "2026-10-09T04:30:31.900650+08:00"
item_ids: ["latentspace-246b796b7931eda8f3ce2da6"]
---
# AI Daily Digest - 2026-10-09

## [AINews] Claude Haiku 5.5 — better than GPT-6 Luna at the same pricing

## 🧠 模型进展
- Anthropic 发布 Claude Haiku 5.5，称其为迄今最便宜、最快、最强的小模型，运行成本平均比 Haiku 4.5 低约 75%，定价与 OpenAI GPT-6 Luna 对齐。
- Artificial Analysis 独立评测显示 Haiku 5.5 最高 effort 下 Intelligence Index 为 43，较前代 Haiku 提升 26 分，略超 GLM-5.3 Flash、Gemini 3.8 Flash 和 GPT-6 Luna，接近 Kimi K3。
- Haiku 5.5 首次为 Haiku 档引入 effort 设置与自适应思考，支持 100 万 token 上下文，并宣称 OSWorld 从 15% 升至 72%、TerminalBench 从 0% 升至 39%。
- 独立 Terminal-Bench 4.0 得分为 33%，AA-Briefcase 为 1578 Elo，但 AA-Omniscience 准确率 36%、幻觉率 40%，AutomationBench-AA 因过度拒答 bug 仅 35%。
- 主要代价是 token 消耗高，最高 effort 下每个 Index 任务约用 162k 输出 token，约为 GPT-6 Luna 的 3 倍，且超过 100K token 的 prompt 价格升至 5 倍。

## 🤖 Agent/产品进展
- Haiku 5.5 已在 Claude Platform 和 Claude Code 上线，Anthropic 将其定位为与 Opus 5.5 或 Sonnet 5.5 搭配的子代理，用于摘要、压缩和数据库查询等高并发低成本任务。
- Claude 的 Python 和 TypeScript SDK 同日内置 computer-use 与 browser-use 工具链，SDK 负责动作循环并可将点击和按键发送给 browser_use、Browserbase、E2B 或 Daytona。
- Cursor 称 Haiku 5.5 在较短请求上比 Haiku 4.5 便宜 10 倍，GitHub Copilot 称其在许多编码任务上匹配 Claude Sonnet 5 且使用更少 token 和步骤。
- Devin 报告 Haiku 5.5 在 FrontierCode 1.1 上得 58.4%，超过 Sonnet 5，且每任务成本约为其八分之一，并建议在 Fusion 中作为 Opus 5.5 的助手。
- Agent Arena、Code Arena WebDev、Text、Document、Vision 已加入 Haiku 5.5，OpenDocRouter 同日接入，Arena 分数待公布。

## 🔬 AI for Science
- OpenAI 的 722 份数学手稿项目被列入其他新闻，聚焦规模、效率与影响，但摘要未提供更多细节。

## 🏭 产业新闻
- Anthropic 同日下调 Sonnet 5.5 价格，缓存读取从每百万 token 0.20 美元降至 0.10 美元，使 Sonnet 5.5 在多数长时运行或代理任务上便宜约 20%。
- Haiku 5.5 采用分层定价：100K token 以下输入/输出为每百万 0.10/0.50 美元、缓存读取 0.01 美元；超过 100K 则为 0.50/2.50 美元、缓存读取 0.05 美元。
- Anthropic 为订阅用户提供 Claude Platform API 额度：Max 5x 每月 100 美元、Max 20x 每月 200 美元、Team 最高 500 美元可池化，可用于任何模型和第三方 harness。
- 此次发布被普遍视为针对 OpenAI GPT-6 Luna 的价格竞争，Anthropic 同时降价 Sonnet 缓存读取并提供 API 额度，被认为是在向 OpenAI 施压。
- Anthropic 目前拥有 Haiku、Sonnet、Opus、Fable 加 Mythos 的产品线，被评论者称为所有实验室中最深的产品阵容，对应 OpenAI 的 Luna、Sol、Astra。

[查看原文](https://www.latent.space/p/ainews-claude-haiku-55-better-than)
