---
schema_version: 1
id: "latentspace-9ba57426ebab3f9367f5146e"
category: "ai_news"
title: "NaiveAI Promises 2,100 Tokens per Second. How Well Does It Code?"
source:
  name: "latent_space"
  url: "https://latent.space/p/naiveai"
  external_id: "urn:latent-space:post:post_e9d76b13-59aa-4ee4-9132-5d55b5763030"
authors: []
source_published_at: "2026-11-11T02:56:32+08:00"
retrieved_at: "2026-11-11T04:30:00.907514+08:00"
published_at: "2026-11-11T04:30:53.162519+08:00"
summary: "## 🧠 模型进展\n- NaiveAI 发布开放权重编程模型 Naive-N0.5-Flash，基于小米 MiMo-V2.5 继续训练并适配 DeepSeek Sparse Attention。\n- 该模型为 310B 参数稀疏 MoE、15B 激活参数，额外用约 3.25T token 训练，其中约 3T 在 1M 上下文长度下训练。\n- 官方基准显示其 NL2Repo-Bench 得分 71.9，高于 DeepSeek V4.1 Flash 1017 的 68.2 和 GLM 5.3 Flash 的 56.3，但 DeepSWE v1.1 与 ALE 略低于 DeepSeek。\n- 借助自研 NaiveRT 推理引擎和投机解码，峰值约 2,100 tokens/s，思考阶段约 984 tokens/s，回答阶段约 1,816 tokens/s。\n- 实测思考模式下中位响应时间 3.1 秒，快于 GLM 5.3 Flash 的 5.3 秒和 DeepSeek V4.1 Flash 1017 的 10.1 秒，但困难任务平均耗时更高。\n\n## 🤖 Agent/产品进展\n- Naive-N0.5-Flash 面向 AI 编程任务，旨在加速工程与研究迭代流程。\n- NaiveAI 配套推出自研推理引擎 NaiveRT，称完整投机解码轮次耗时 3.4ms，较 SGLang 的 12.3ms 降低 72.4%。\n- 在太阳系 3D 应用测试中，Naive-N0.5-Flash（思考模式）效果最佳；3D 树应用与 DeepSeek V4.1 Flash 1017 持平。\n- 在《Ray Tracing in One Weekend》浏览器移植中应用可运行，但 JavaScript 效率不及 DeepSeek V4.1 Flash 1017；关闭思考模式时 3D 树应用不可用。\n\n## 🔬 AI for Science\n- 暂无重要进展。\n\n## 🏭 产业新闻\n- 中国公司 NaiveAI 发布开放权重模型，目标定价为每百万输入 token 0.10 美元、输出 token 0.40 美元、缓存读取 0.01 美元。\n- 该定价使 Naive-N0.5-Flash 进入每百万输出 token 0.20 至 0.60 美元的 Flash 模型竞争区间，对标 DeepSeek V4.1 Flash 1017 和 GLM 5.3 Flash。\n- NaiveAI 宣称该模型主要由 AI 构建并用于 AI 研究，长期目标是递归自我改进。"
why_it_matters: null
tags: ["Agent/产品进展", "产业新闻", "模型进展"]
language: "zh-CN"
briefing_ids: ["ai_news-2026-11-11"]
---
