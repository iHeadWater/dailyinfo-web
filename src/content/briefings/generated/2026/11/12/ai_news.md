---
schema_version: 1
id: "ai_news-2026-11-12"
category: "ai_news"
date: "2026-11-12"
title: "DailyInfo ai_news briefing"
generated_at: "2026-11-12T04:31:15.138186+08:00"
published_at: "2026-11-12T04:31:15.138186+08:00"
item_ids: ["latentspace-867d9e5beabe8eab4c24f005", "latentspace-f3521150594f6cae422a9d0b", "latentspace-68ccaf42f1f73465a695a327"]
---
# AI Daily Digest - 2026-11-12

## [AINews] Mercor $750m Series D at $20B valuation, $3B run rate

## 🧠 模型进展
- Google 发布 Gemini 4 Carbon，面向长周期 Agentic 软件工程、网络安全、知识工作和科学任务，并在 Cursor、Devin、Perplexity、GitHub Copilot 同日集成。
- Anthropic 推出 Claude Fable 5.2 与 Mythos 5.2，Fable 在多模态知识 Agent 等基准领先，但成本与 token 消耗显著更高且早期测试反馈不稳定。
- MiniMax 发布开放权重图像模型 H3-Image，支持原生 4K/16M 像素生成与编辑，并快速提供 ComfyUI 权重。
- 研究侧出现 TTF 三元训练/转换与 Deletion Tuning 等低内存后训练方法，可在消费级 GPU 上训练或低成本微调更大模型。

## 🤖 Agent/产品进展
- Claude 推出 Whiteboards、Sheets、Data 正式可用及 MCP Apps 公共预览，并扩展 Meetings 加入 Google Meet。
- OpenAI 为 ChatGPT Business 增加企业认证主页、Business Agent 和 “Sign in with ChatGPT” 第三方登录能力。
- Cursor 重构 Projects，使团队成员的编程 Agent 可共享计划并相互标记冲突。
- Google Antigravity 新增 /swarm，把单条提示转为可按角色调用不同模型的多 Agent 团队。
- Apple 据报开发 Harbor，把 Apple Silicon Mac 变成可多机 Thunderbolt 5 组池的私有本地推理服务器。

## 🔬 AI for Science
- Google DeepMind 用 AlphaProof Code 对 Signal 生产机器码的关键安全属性进行形式化验证，并由 Carbon 生成逾 600 万行机器校验 Lean 证明。
- Google 称 Carbon 结合 AlphaFold 3 找到的远程蛋白同源物数量提升 40 倍。
- Anthropic 称 Fable 设计的三个器件经 Diode 制造无需改电路即可工作，Mythos 5.2 准确建模 34 个病毒衣壳中的 28 个。
- Geodesic 的 NovaAtom-Lite 在抗体-抗原结构预测上报告 79.07%，高于 AlphaFold 3 的 47.90%。

## 🏭 产业新闻
- Anthropic 启动 IPO 路演，拟发行 8.25 亿股、定价 70–78 美元，对应约 1.24–1.38 万亿美元摊薄估值，文件披露 10 月底年化收入 810 亿美元。
- Mercor 完成 7.5 亿美元 D 轮，估值 200 亿美元，年化收入达 30 亿美元。
- The Information 报道 Shanghai Century Litong 促成至少 75 亿美元 Nvidia 芯片流向中国，相关调查转交 DOJ。
- OpenAI、Anthropic、Mistral 等签署 Paris Call for AI Safety and Security，Bengio 呼吁强制独立审计。
- Fireworks 被黑事件据报影响 Notion 客户数据。

[查看原文](https://latent.space/p/ainews-mercor-750m-series-d-at-20b-valuation-3b-run-rate/)

# AI Daily Digest - 2026-11-12

## AI Engineer Code Summit: OpenAI on New Ways of Working With Codex

## 🧠 模型进展
- 暂无重要进展

## 🤖 Agent/产品进展
- OpenAI 在 AI Engineer Code Summit 的 Codex 工作坊展示 Codex 近期大量产品更新及“新编码工作方式”。
- 新版 Codex Cloud 支持一次发布环境后在隔离实例中并行运行多任务，并可按公司共享环境、选择 GitHub 仓库。
- Codex 改进本地与云端衔接，本地任务可移交云端且 Appshot 仍保留，本地 Codex 也可直接启动云端任务。
- 语音模式被用于编码任务控制面，可管理线程、检查进度、跨应用取数并创建新线程。
- 个人 Agent 形态受关注，OpenAI dots 可作遗漏检查的安全网、Slack 委派入口和无处不在的助手，Anthropic Claude Duet 也被提及可在会话间协助。

## 🔬 AI for Science
- 暂无重要进展

## 🏭 产业新闻
- AI Engineer Code Summit 开幕，OpenAI、Anthropic、Google DeepMind 等前沿实验室举办工作坊。
- 报道指出编码 Agent 向云端迁移仍是 Codex、Claude 和 Antigravity 用户面临的共同困惑。

[查看原文](https://latent.space/p/codex-work/)

# AI Daily Digest - 2026-11-12

## Designing for Agents — Zeno Rocha, Resend

## 🧠 模型进展
- AEO 研究显示，Claude Code 在可提取的 102 次邮件服务推荐中有 64 次首选 Resend，SendGrid 仅 7 次首选但 55 次作为备选。
- 更全面的 AEO 研究显示竞争更激烈，Postmark 在多数模型中排名第一。
- 模型推荐会因模型和应用而异，而开发者若直接接受 Agent 首选补丁，第二选择往往很少被实际尝试。

## 🤖 Agent/产品进展
- Resend 的 MCP server 从发布时约 20 个工具扩展到 80 多个，目标是在聊天客户端复刻仪表盘能力。
- Resend 为 Agent 优化定价页，在 URL 后加 .md 即可返回一次可读取的价格表。
- React Email 作为先发分发入口，让开发者在选用邮件服务商前就把 Resend 代码带入仓库。
- Resend 推出自定义跟踪域名，避免共享跟踪域名被钓鱼滥用后连累其他客户邮件链接。
- Resend 与 Cloudflare Code Mode 的少工具路线形成对比，并建议检查工具返回结果是否过大以节省上下文。

## 🔬 AI for Science
- 暂无重要进展

## 🏭 产业新闻
- Resend 披露拥有 430 万用户和 12 万付费客户。
- Resend 将 AEO/Agent Experience 作为增长策略，利用模型推荐影响开发者选型。
- Resend 承诺投入 300 万美元用于安全/反滥用，同时保留免费层。
- Resend 客户包括 Warner Bros. Discovery，CEO 通过筛选短 .com 域名发现该客户。

[查看原文](https://latent.space/p/resend/)
