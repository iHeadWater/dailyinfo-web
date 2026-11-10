---
schema_version: 1
id: "ai_news-2026-11-11"
category: "ai_news"
date: "2026-11-11"
title: "DailyInfo ai_news briefing"
generated_at: "2026-11-11T04:30:53.162519+08:00"
published_at: "2026-11-11T04:30:53.162519+08:00"
item_ids: ["latentspace-9ba57426ebab3f9367f5146e", "latentspace-5dc63f6ae87235d0c4c8e212"]
---
# AI Daily Digest - 2026-11-11

## NaiveAI Promises 2,100 Tokens per Second. How Well Does It Code?

## 🧠 模型进展
- NaiveAI 发布开放权重编程模型 Naive-N0.5-Flash，基于小米 MiMo-V2.5 继续训练并适配 DeepSeek Sparse Attention。
- 该模型为 310B 参数稀疏 MoE、15B 激活参数，额外用约 3.25T token 训练，其中约 3T 在 1M 上下文长度下训练。
- 官方基准显示其 NL2Repo-Bench 得分 71.9，高于 DeepSeek V4.1 Flash 1017 的 68.2 和 GLM 5.3 Flash 的 56.3，但 DeepSWE v1.1 与 ALE 略低于 DeepSeek。
- 借助自研 NaiveRT 推理引擎和投机解码，峰值约 2,100 tokens/s，思考阶段约 984 tokens/s，回答阶段约 1,816 tokens/s。
- 实测思考模式下中位响应时间 3.1 秒，快于 GLM 5.3 Flash 的 5.3 秒和 DeepSeek V4.1 Flash 1017 的 10.1 秒，但困难任务平均耗时更高。

## 🤖 Agent/产品进展
- Naive-N0.5-Flash 面向 AI 编程任务，旨在加速工程与研究迭代流程。
- NaiveAI 配套推出自研推理引擎 NaiveRT，称完整投机解码轮次耗时 3.4ms，较 SGLang 的 12.3ms 降低 72.4%。
- 在太阳系 3D 应用测试中，Naive-N0.5-Flash（思考模式）效果最佳；3D 树应用与 DeepSeek V4.1 Flash 1017 持平。
- 在《Ray Tracing in One Weekend》浏览器移植中应用可运行，但 JavaScript 效率不及 DeepSeek V4.1 Flash 1017；关闭思考模式时 3D 树应用不可用。

## 🔬 AI for Science
- 暂无重要进展。

## 🏭 产业新闻
- 中国公司 NaiveAI 发布开放权重模型，目标定价为每百万输入 token 0.10 美元、输出 token 0.40 美元、缓存读取 0.01 美元。
- 该定价使 Naive-N0.5-Flash 进入每百万输出 token 0.20 至 0.60 美元的 Flash 模型竞争区间，对标 DeepSeek V4.1 Flash 1017 和 GLM 5.3 Flash。
- NaiveAI 宣称该模型主要由 AI 构建并用于 AI 研究，长期目标是递归自我改进。

[查看原文](https://latent.space/p/naiveai/)

# AI Daily Digest - 2026-11-11

## [AINews] Fable 5.2 retakes World #1 LLM spot as $ANT IPO roadshow begins

## 🧠 模型进展
- Anthropic 发布 Claude Fable 5.2 与 Claude Mythos 5.2，称其在多数评估能力上超过 Opus 5.5，Fable 5.2 在 Artificial Analysis Intelligence Index 以 65 分重夺全球第一。
- Fable 5.2 在 HLE-Diamond 80%、FrontierCode 2.0 49%、AA-Omniscience 67、Terminal-Bench-Science 73% 和 CritPt v2 hard 77% 等基准刷新纪录，展示推理、编码与科学任务提升。
- Fable 5.2 单价降至每百万输入/输出 token 8/40 美元，但更“吃 token”且大量测试与子代理检查令单任务成本上升，同时 high/xhigh 常优于 max 的异常限制其生产配置。
- ByteDance 发布 Seedream 5.5 图像模型，强化百轮连续编辑稳定性、像素级保留未编辑区域并原生输出 RGBA 透明资产。
- Google Cloud 上线 Muse Ember，并与 Muse Wonder、Muse Spark 1.3 一同发布，早期匿名 crouton-alpha 检查点在测试中处理超过 5T token。
## 🤖 Agent/产品进展
- Fable 5.2 首日接入 Cursor、GitHub Copilot/VS Code、Perplexity Computer/Search、Factory、Hermes Agent 与 Arena，默认 effort 设为 medium。
- Anthropic 展示 1,000+ 子代理从空目录用 8 天构建可启动操作系统，并用短提示设计三款可用电子设备，突出长时程代理与并行子代理能力。
- 社区发布 MIT 许可的 Windows MCP 游戏控制服务器，通过注入 DLL 与约 100 个 TypeScript 工具让 Claude 在后台玩 GTA 等单机游戏并迭代诊断。
- DeepSeek V4.1 Flash 借 REA/Ghidra MCP 在无网沙箱约 1 小时逆向 1984 年 Sopwith DOS 游戏并重建成 HTML5 Canvas 版本，成本约 0.68 美元（非高峰）。
- 开发者用 Atomic Agent 让 Fable 5.2 作为规划/审查者、三个本地 Qwen 3.8 27B 作为构建者，在单一 Three.js 项目中把成本降至约 1/5、耗时缩短约一半，但作者注明只是单点数据。
## 🔬 AI for Science
- 1,000 个 Fable 5.2 代理在 30 小时内形式化了费马大定理的已有证明，而 Opus 5.5 在 18 小时内仅完成 26%。
- Mythos 5.2 准确建模 34 个基因治疗衣壳中的 28 个，显示其在生物医药设计任务上的应用潜力。
- Fable 5.2 提出未经验证的化学合成路线，并改进 72 个开放优化问题的已有解，展示在化学与优化研究中的探索能力。
- 在 VIALS-AA 科学视觉推理评测中 Fable 5.2 得分 67%，其平均每任务约 37 次工具调用并采用裁剪、通道掩码、圆拟合与强度剖面验证等步骤。
## 🏭 产业新闻
- Anthropic 的 $ANT IPO 路演在 Fable 5.2 发布同日启动，市场评论对其模型能否支撑 IPO 估值存在分歧。
- 法国政府发布 Paris Call for AI Safety and Security，Sakana、OpenAI、Anthropic、微软、Mistral 与 Hugging Face 等签署，覆盖前沿评估、风险管理、透明度、信息共享与预警框架。
- Samsung 在 Hot Chips 2026 展示 HBM5，保持 2048 pin 但把 pin 速率从 14 Gbps 提升到 28 Gbps 以上，并通过边缘 PHY 与热烟囱设计应对功耗和散热。
- OpenRouter 的 CSAM 筛查政策可能突破零数据保留承诺，引发对图像/视频哈希匹配是否会扩展到文本分类审查及误报的担忧。

[查看原文](https://latent.space/p/ainews-fable-5-2-retakes-world-1-llm-spot-as-ant-ipo-roadshow-begins/)
