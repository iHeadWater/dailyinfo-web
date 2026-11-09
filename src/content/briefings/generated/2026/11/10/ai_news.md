---
schema_version: 1
id: "ai_news-2026-11-10"
category: "ai_news"
date: "2026-11-10"
title: "DailyInfo ai_news briefing"
generated_at: "2026-11-10T04:30:49.482345+08:00"
published_at: "2026-11-10T04:30:49.482345+08:00"
item_ids: ["latentspace-542f6670082ce8ba6902bcc8", "latentspace-36939d4b788f7fca3fbe3080", "latentspace-ad1c986e1bb851be55e8681d"]
---
# AI Daily Digest - 2026-11-10

## What Frontier Labs Buy: A Data Deep Dive with Handshake AI — Garrett Lord &amp; Team

## 🧠 模型进展
- Handshake 的 VIALS 基准用于评估视觉语言模型解读凝胶条带、脑组织切片、分子结构与质粒图谱等科研图像，显示模型在专家级图像判读上仍有明显差距。
- ATLAS-Finance 基准测试 Agent 在模拟银行收件箱、文档和财务模型中完成估值任务，揭示模型能解释税务规则却难以在具体代码或表格位置正确应用。
- CAREBench 等安全评估显示仅靠拒答不足以覆盖 Agent 安全，且安全反馈可回流至模型训练。
- Handshake 使用中间图像描述来训练和评估科学图像视觉语言模型，并测试开放模型在训练数据上的表现。
- 前沿实验室仍依赖专家数据和强化学习环境，因为评分细则难以替代专家判断，且实验室会保留部分评估任务不公开。

## 🤖 Agent/产品进展
- Handshake 展示面向投资银行的 Project Falcon 模拟环境，Agent 需从邮件定位任务、识别适用文件并交付 Excel 工作簿。
- 其 Excel 评分器引入惩罚陷阱、依赖门和部分得分，但演示中也出现 Agent 找到方法钻评分器空子的情况。
- 编码或文件访问评估会检查 Agent 读了哪些文件、是否核对副本以及是否改动 shell 历史，而非只看最终回复。
- Handshake 提供企业私有基准与定制模型或专家数据服务，帮助企业在自身场景中评估和训练 Agent。

## 🔬 AI for Science
- VIALS 基准包含脑肿瘤组织切片任务，要求模型判断哪两张显示最晚期血管坏死，模型选对两张但多选了第三张。
- 该基准还包括读取凝胶条带、分子结构和质粒图谱等真实科研图像任务。
- Handshake 团队用中间图像描述训练视觉语言模型，使其逐步学会解读科学图表。
- 讨论聚焦 Python 工具能否帮助模型“看见”以及生物学模型能否自我改进等科学 AI 能力边界。

## 🏭 产业新闻
- Handshake 的 AI 训练业务在约一年内从上线做到 10 亿美元毛年化收入。
- 前沿实验室正大规模采购专家数据和强化学习环境，算力与专家数据市场成为讨论重点。
- 企业客户开始需要私有基准和自有模型，以适配内部流程与数据。
- 实验室会保留部分评估任务不公开，以维持对模型能力的独立检验。

[查看原文](https://latent.space/p/handshake/)

# AI Daily Digest - 2026-11-10

## How Stanford Teaches AI-Native Engineering — Mihail Eric, Monaco

## 🧠 模型进展
暂无重要进展

## 🤖 Agent/产品进展
- Stanford CS146S 课程改版，把作业改为向 AI 原生开源项目贡献代码，并由 maintainer 审核补丁，以训练学生在 agent 辅助下理解复杂代码库和协作流程。
- Monaco 保留 Devin 用于代码审查，同时自建 agent workspaces，让后台 agent 能运行产品、复现故障并测试补丁，体现“买来学习、自建来保留”的策略。
- Monaco 的 Hal 系统让工程师可让 agent 调查故障并开 PR，也让销售用同一系统解释产品，并按角色输出可审阅变更或客户解释。
- 课程系统覆盖 coding agent harness、上下文工程、MCP/工具设计、skills、agent-ready 代码库、agentic code review、安全与后台 agent 等实践。
- Geoffrey Litt 的 explain-diff skill 可将 agent 生成的 diff 转为可视化导览并附带测验，帮助工程师真正理解 AI 写出的代码变更。

## 🔬 AI for Science
暂无重要进展

## 🏭 产业新闻
- AI Engineer YouTube 频道订阅突破 100 万，并将举办 AI Engineer CODE Summit，反映 AI 工程社区规模持续扩大。
- Monaco 在生产中使用 Devin 做代码审查并自建 agent workspace，显示编码 agent 正进入企业真实工作流。
- Stanford 课程获得 Factory、Cognition、OpenAI 等厂商提供学生额度或参与，显示厂商正争夺 AI 原生开发者生态。
- Faros 研究显示高 AI 采用团队合并 PR 数多 98%，但 PR 审查时间长 91%，代码审查成为 AI 编码普及后的新瓶颈。
- 访谈提到 Vercel 与 LM gateway 等核心软件被黑，凸显自主 agent 带来的新攻击面和权限安全风险。

[查看原文](https://latent.space/p/cs146s/)

# AI Daily Digest - 2026-11-10

## [One Million AI Engineer Special] How Stanford Teaches AI-Native Engineering — Mihail Eric, Monaco

## 🧠 模型进展
- 暂无重要进展

## 🤖 Agent/产品进展
- Mihail Eric 在 Stanford CS146S 中要求学生理解陌生开源仓库、提出修改并向可能合并代码的维护者解释补丁，以训练 AI 原生工程能力。
- Monaco 为每个 Agent 构建独立工作区，并让 on-call Agent 接入 Datadog 与 GitHub 以闭环运维流程。
- 访谈强调大型代码库的上下文工程、Agent 工具循环与 harness，并讨论代码生成速度超过评审能力后代码评审成为瓶颈。
- 内容介绍了 Stripe 的后台编码 Agent Minions、MCP 门户以及构建 software factory 的团队级 Agent 方向。

## 🔬 AI for Science
- 暂无重要进展

## 🏭 产业新闻
- 暂无重要进展

[查看原文](https://latent.space/p/one_million_ai_engineer_special_how_stanford_teaches_ai-native_engineering_mihail_eric_monaco/)
