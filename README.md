# dailyinfo-web

DailyInfo 公共 Web 门户 — 基于 [Astro](https://astro.build) 的静态发布站点。

当前生产地址：<https://iheadwater.github.io/dailyinfo-web/>（GitHub Pages Project Site，base 为 `/dailyinfo-web/`）。未来目标地址为 <https://daily.iheadwater.org/>（根路径 base `/`）。

本仓库**不包含任何后端代码**：没有 Python、数据库、SSR、API Route 或 Serverless。整个站点在构建期从内容文件生成静态 HTML / CSS / XML。

## 与 dailyinfo 的关系

| 仓库 | 职责 |
| --- | --- |
| `dailyinfo`（后端） | 采集 → Normalize → 去重 → Retrieval/Filtering → LLM 摘要 → Publication 生成 |
| `dailyinfo-web`（本仓库） | Publication → Schema 校验 → Astro 静态页面 → RSS → Sitemap → GitHub Pages |

长期架构：

```text
DailyInfo Core
      ↓
Canonical Publication
      ↓
WebPublisher（Phase 2D）
      ↓
dailyinfo-web（本仓库）
      ↓
Astro Build
      ↓
GitHub Pages → iheadwater.github.io/dailyinfo-web/
```

**Phase 2D 边界**：生产内容只接受 `src/content/items/generated/` 与
`src/content/briefings/generated/` 下由 DailyInfo WebPublisher 管理的文件。
合成 demo 内容保留在 `tests/fixtures/content/`，通过
`npm run validate -- --fixtures` 和契约测试校验，不会混入生产站点。

## 技术架构

- **Astro 5**（`output: 'static'`）+ TypeScript（strict）
- **Astro Content Collections**（glob loader）承载全部内容
- **Zod schema**（经由 `astro/zod`）做构建期契约校验，fail-closed
- **@astrojs/rss** 生成全局与分类 feed；**@astrojs/sitemap** 生成 sitemap
- **rehype-sanitize** 清洗 Briefing Markdown，禁止任意 raw HTML
- 零 UI 框架（无 React/Vue/Svelte）；唯一客户端 JS 是主题切换（localStorage）

## 环境要求

- Node.js **≥ 22.18**（scripts 直接导入 TS，依赖 Node 内建 type stripping）
- 包管理器：**npm**（`package-lock.json` 为准）

## 安装与本地开发

```bash
npm install
npm run dev        # http://localhost:4321
```

其他命令：

```bash
npm run validate   # 独立内容校验（fail-closed，CI 第一关）
npm run test       # 契约回归测试（identity/URL/GUID/integrity + Astro 缓存行为探针）
npm run check      # astro check（Astro + TypeScript）
npm run build      # 生产构建到 dist/，并验证生成 artifact 的 base path
npm run verify-build # 单独验证已存在的 dist/ artifact
npm run preview    # 本地预览 dist/
npm run ci         # validate + test + check + build（本地完整把关）
```

生产构建不需要 Python、数据库、网络 API 或任何 secret。

### 本地开发注意事项

- 当前生产配置使用 `SITE_BASE=/dailyinfo-web`；本地开发请访问 <http://localhost:4321/dailyinfo-web/>。未来切换自定义域名时，将 `SITE_ORIGIN` 改为 `https://daily.iheadwater.org`、`SITE_BASE` 改为 `/`，业务路由和 Item identity 不需要修改。

- **Astro 内容缓存**：契约测试保留缓存行为探针；生产 `npm run build` 使用 `astro build --force`，确保 WebPublisher 新写入或移除的 generated 内容始终按当前文件重新同步和校验。
- **Telemetry**：Astro 在检测到 CI 环境时自动禁用 telemetry，工作流无需配置。本地正常开发亦无需配置；仅在受限沙箱环境中可 `export ASTRO_TELEMETRY_DISABLED=1`（未写入 npm scripts，避免平台特例污染配置）。

## Content Model 与契约（已冻结）

> **正式契约文档：[docs/contracts/publication-v1.md](docs/contracts/publication-v1.md)**
> 该文档是跨仓接口合同（identity、URL、RSS GUID、不可变字段、校验职责、Phase 2 Producer 要求），以下仅为概览。

两个核心概念，严格分离：

- **Item** — 最小可独立分享的情报单元（论文 / 项目 / 新闻 / 资源）。身份是 `id`（稳定 ID），**绝不**来自标题、hash 或文件名。
- **Briefing** — 某天某分类的日报，通过 `item_ids`（稳定 ID 列表）引用 Item。

### Category Contract

Canonical 定义只在 [`src/lib/categories.ts`](src/lib/categories.ts)：

| 内部 ID | 公共 URL |
| --- | --- |
| `papers` | `/papers/` |
| `ai_news` | `/ai-news/` |
| `code` | `/code/` |
| `resource` | `/resource/` |
| `arxiv` | `/arxiv/` |

新增分类 = 在该文件加一个条目；路由、导航、feed、sitemap、archive 全部自动跟随，无需改动其他文件。

### Schema

见 [`src/lib/schemas.ts`](src/lib/schemas.ts)（zod，`.strict()` 拒绝未知字段）。要点：

- Item：`schema_version`（必须为 1）、`id`、`category`、`title`、`source{name,url,external_id?}`、`authors[]`、`source_published_at`（可靠来源时间或显式 `null`）、`retrieved_at`、`published_at`、`updated_at?`、`summary`、`why_it_matters?`（可为显式 `null`）、`tags[]`、`language`、`briefing_ids[]`
- Briefing：`schema_version`、`id`（必须等于 `{category}-{date}`）、`category`、`date`、`title`、`generated_at`、`published_at`、`updated_at?`、`item_ids[]`，Markdown body 为日报正文

### URL Contract

```text
/                                    首页（latest available date 从内容推导）
/{category}/                         分类页（published_at DESC）
/archive/                            归档
/daily/{YYYY-MM-DD}/                 某日全部日报
/daily/{YYYY-MM-DD}/{category}/      单个 Briefing
/{category}/{item-id}/               Item 永久链接（稳定 ID）
```

Item URL 只由 `category + id` 决定，标题修改永不改变 URL。

部署 URL 分为三层，禁止在业务代码中混用：

- **Logical route**：`/papers/openreview-example-001/`，只表达业务路由和 publication identity。
- **Browser href**：`/dailyinfo-web/papers/openreview-example-001/`，由 `withBase()` 将当前部署 base 加到 logical route 上。
- **Absolute public URL**：`https://iheadwater.github.io/dailyinfo-web/papers/openreview-example-001/`，由 `absoluteUrl()` 生成，用于 canonical、`og:url`、RSS link/GUID、robots 和 sitemap。

部署配置集中在 [`src/lib/site.ts`](src/lib/site.ts)：当前默认值是 `SITE_ORIGIN=https://iheadwater.github.io`、`SITE_BASE=/dailyinfo-web`；未来只需改为 `SITE_ORIGIN=https://daily.iheadwater.org`、`SITE_BASE=/`。


## Content ownership and fixtures

`src/content/items/generated/` 与 `src/content/briefings/generated/` 是
WebPublisher 的唯一生产写入边界。路径、frontmatter 和 Markdown body 均由
DailyInfo 确定性生成；Web 仓库不从旧的 `briefings/` 或 `pushed/` 目录读取。

合成 demo 数据位于 `tests/fixtures/content/`，覆盖 2 个日期、5 个分类、
17 个 Item、10 个 Briefing、多作者/无作者、多 tags/无 tags、长标题、中英文
混合和不同 source。所有条目均为虚构，不复制任何第三方全文。

## Validation（fail-closed）

共享校验核心 `src/lib/validate-content.ts` 只有一份实现，被两个关卡调用（CLI 与 build 不会漂移）：

1. **`npm run validate`**（`scripts/validate-content.mjs`）— 直接校验生产生成目录（永远新鲜），执行共享核心：schema 校验、重复稳定 ID、Briefing ID 确定性、briefing ↔ item 双向引用完整性和分类一致性。首次发布前空目录是有效状态。
2. **`npm run validate -- --fixtures`** — 校验隔离的合成 fixture，并执行覆盖度检查。
3. **`npm run test`**（`scripts/contract-tests.mjs`）— 契约回归测试：title/category 变化对 URL 与 GUID 的影响、schema 负向用例、integrity 负向用例、可空 source time/significance，以及 `tests/refine-probe` 探针（固化 Astro 内容缓存行为矩阵）。
4. **`astro check`** — Astro/TypeScript 静态检查。
5. **`astro build`** — Content Collections schema 校验 + 同一共享核心的 build 侧完整性检查。

校验职责划分（Schema Validator vs Integrity Validator）与 W1-001 根因（Astro 内容缓存在 schema 收紧后不复验未变更条目）详见契约文档 §10。

## GitHub Pages

`.github/workflows/deploy.yml`（main 分支）：在显式的 `SITE_ORIGIN`/`SITE_BASE` 环境下 install → validate → test → check → build（含 dist artifact 验证）→ `actions/deploy-pages@v4`。
`.github/workflows/validate.yml`（PR）：install → validate → test → check → build。

仓库 Settings → Pages 需选择 **GitHub Actions** 作为部署来源。

## DailyInfo WebPublisher（Phase 2D）

```text
dailyinfo
  → PublicationStore（Canonical PublicationBundle）
  → WebPublisher（只写 generated/，按稳定 identity upsert）
  → npm run validate / test / check / build
  → dailyinfo-web（静态生成与 GitHub Pages）
```

WebPublisher 使用持久本地 checkout，发布前要求目标 branch、origin 和
worktree 符合配置且 clean；随后 fetch/fast-forward、原子写入生成文件、运行
完整 Web gates，并以 DailyInfo Bot 身份创建一个 briefing 粒度的普通 commit。
只允许 `git push origin main` 形式的 fast-forward 推送；失败时保留本地
publisher commit，下一次运行可安全 retry。Web 的 delivery state 位于
DailyInfo 的 `deliveries/web/`，与 Discord 独立。
