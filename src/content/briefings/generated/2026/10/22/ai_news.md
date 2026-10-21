---
schema_version: 1
id: "ai_news-2026-10-22"
category: "ai_news"
date: "2026-10-22"
title: "DailyInfo ai_news briefing"
generated_at: "2026-10-22T04:30:26.349332+08:00"
published_at: "2026-10-22T04:30:26.349332+08:00"
item_ids: ["latentspace-110b3ab3b41bebdc12d80622"]
---
# AI Daily Digest - 2026-10-22

## [AINews] DeepSeek DeepInfer: Open Source SOTA Inference running 155T toks/day/cluster making $22m/day at ~80% margin for a 81 day payback

## 🧠 模型进展
- DeepSeek V4.1 Flash 在 Agent Arena 排名开源第一、总榜第11，并在模拟企业网络任务中平均进度超过 GPT-6 Sol，但效率与最佳单次表现仍有争议。
- MiniMax 发布 M3.1 Flash，API 立即可用、10月23日开放权重，采用约428B总参/23B激活的MoE、稀疏注意力和原生视觉编码器。
- Meta 开源 30B 多模态 Agent 模型 Muse Glimmer，支持32GB显存/单张RTX 5090的4-bit部署，并报告 MCPAtlas 75.5、SWE-Bench Pro 51.2。
- Mistral 发布 Voxtral 3，提供批量与流式转写、多语种TTS及带工具调用的语音Agent SDK，支持API或客户自有基础设施部署。
- Bria 发布 Fibo 2.0 8B 开放权重图像家族，编辑性能在开放权重中领先、文生图与 Qwen-Image-2.1 统计持平，但权重为非商用许可。

## 🤖 Agent/产品进展
- DeepSeek 开源生产推理栈 DeepInfer，支持分布式推理、投机解码、SWA Bounded Replay 和结构化输出，覆盖 NVIDIA 与华为 Ascend 平台。
- OpenAI 将 API prompt caching 从默认30分钟扩展至12小时，并允许单请求混合不同保留时长，利好长周期 Agent 复用上下文。
- SGLang 合并 megakernel 支持，AgentX 在 GB300 NVL72 上接近1000 tokens/s/user、MI355X 交互性提升1.5倍，vLLM TorchTPU 上 Kimi K3 在 TPU v7 达391 tokens/s/user。
- Perplexity Computer 支持在受支持 Apple Silicon Mac 上完全本地离线运行模型与 Agent，本地任务使用 PPLX Pro 且不消耗 Computer credits，建议36GB统一内存。
- LangChain Managed Deep Agents 与 Hugging Face Agent Manager 推出持久 Agent 服务，封装凭证、作用域记忆、沙箱执行、定时任务并跨 Claude Code/Codex 等 harness 编排。

## 🔬 AI for Science
- Anthropic 与 Citrini 用 Claude 研究模型设计211个蛋白并实验验证17个蝎毒结合蛋白，公开全部设计与实验数据，但尚未证明多毒素结合或中和效力。
- Sophont 的 Holon-S1 从常规病理切片预测空间基因活性与生物标志物，跨16种器官、15台以上扫描仪优于两个对比模型，并发现潜在乳腺癌和结肠癌标志物。
- 在开放式AI研究评测中，GPT-6 Astra 与 Claude Fable 5.1 各获1万美元预算回答未发表研究问题，实验设计与资源管理改善但生成论文仍因创造力、判断、校准和沟通不足被拒。
- Claude Opus 5.5 被用于审计量子引力单圈计算，在18任务/9阶段专家脚手架下发现符号、表格漏项和23处笔误，但核心物理结果保持不变，显示其更像符号计算审计工具而非自主科研者。

## 🏭 产业新闻
- DeepSeek 披露 DeepInfer 生产经济性，称单集群服务155T tokens/day、off-peak每加速器小时收入38美元，并据缓存命中率与卡成本推算约80%推理毛利和81天回本。
- OpenAI 宣布收购药物开发协调平台 Orchestra Bio，将生命科学布局从研究工具扩展到运营执行，交易财务条款未披露。
- 前 OpenAI 研究负责人 Bob McGrew 的制造软件公司 Arda 公开亮相，宣布1.6亿美元A轮、15亿美元估值，并与 Anduril 作为设计伙伴。
- 报道称 OpenAI 正寻求约300亿美元融资、估值超1.4万亿美元，同时 Anthropic 招股书草稿据报显示上半年收入163亿美元、算力/基础设施支出近90亿美元、未来算力承诺超6000亿美元。

[查看原文](https://www.latent.space/p/ainews-deepseek-deepinfer-open-source)
