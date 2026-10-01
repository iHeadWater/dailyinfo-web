# DailyInfo Publication Contract — v1

**Status**: FROZEN (Phase 1A contract freeze)
**Applies to**: `dailyinfo-web` Phase 1/2, and the future `dailyinfo` WebPublisher (Phase 2 producer)
**Contract version**: `publication-v1` (content `schema_version: 1`)

This document is the cross-repository interface contract between the `dailyinfo`
backend (Publication Finalizer / WebPublisher) and `dailyinfo-web` (static site).
Once frozen, changes require a new contract version (`publication-v2`) and a new
`schema_version` — never a silent mutation of v1 semantics.

The questions this document freezes, so they never need to be re-discussed:

- What an Item is, what a Briefing is
- What the stable ID is and where identity comes from
- Whether category participates in the canonical URL (it does)
- How Briefings relate to Items
- What the RSS GUID is
- Whether erroneous data is auto-repaired (it is not — fail closed)

---

## 1. Category Contract

The canonical category definition lives in exactly one place:
`src/lib/categories.ts`. Routes, navigation, feeds, sitemap, archive and daily
pages all derive from it. Adding a category means adding one entry there; no
other file hardcodes the category list.

| Internal ID (`category` field) | Public URL slug | Label |
| --- | --- | --- |
| `papers` | `papers` | Papers |
| `ai_news` | `ai-news` | AI News |
| `code` | `code` | Code |
| `resource` | `resource` | Resource |
| `arxiv` | `arxiv` | arXiv |

Rules:

- The `category` field in content uses the **internal ID** (underscore form, e.g. `ai_news`).
- Public URLs use the **slug** (hyphen form, e.g. `/ai-news/`).
- `category` is an enum in both schemas; any other value fails validation.
- The id ↔ slug mapping is stable: renaming a slug breaks URLs and is a
  contract change.

## 2. Item Schema

An **Item** is the smallest independently shareable intelligence unit (a paper,
a repository, a news item, a resource, an arXiv entry). The authoritative
definition is the zod schema in `src/lib/schemas.ts` (`itemSchema`); the field
table below is its semantic contract.

| Field | Required | Default | Constraint |
| --- | --- | --- | --- |
| `schema_version` | ✔ | — | literal `1`; any other value fails closed |
| `id` | ✔ | — | `^[a-z0-9][a-z0-9._-]*$`, globally unique — **the identity** |
| `category` | ✔ | — | category enum; immutable after first publish (§5) |
| `title` | ✔ | — | non-empty; mutable; never participates in identity/URL |
| `source.name` | ✔ | — | non-empty |
| `source.url` | ✔ | — | absolute http(s) URL (zod `.url()` + http(s) refinement) |
| `source.external_id` | ✖ | — | non-empty string when present |
| `source.display_name` | ✖ | falls back to `source.name` | non-empty string or explicit `null`; display and grouping only — never part of identity, URLs or GUIDs |
| `authors` | ✖ | `[]` | list of non-empty strings |
| `source_published_at` | ✔ | — | ISO 8601 timestamp with timezone or explicit `null` when the source does not provide a reliable publication time |
| `retrieved_at` | ✔ | — | ISO 8601 timestamp with timezone |
| `published_at` | ✔ | — | ISO 8601 timestamp with timezone |
| `updated_at` | ✖ | falls back to `published_at` | ISO 8601 timestamp with timezone |
| `summary` | ✔ | — | non-empty; DailyInfo-generated summary |
| `why_it_matters` | ✖ | — | non-empty string or explicit `null` when absent |
| `tags` | ✖ | `[]` | list of non-empty strings |
| `language` | ✖ | `zh-CN` | `zh-CN` \| `en` |
| `briefing_ids` | ✖ | `[]` | stable IDs of briefings including this item |

All objects are `.strict()`: unknown fields fail validation instead of being
silently dropped.

`source.display_name` is an **additive extension made after the v1 freeze**,
not a change of v1 semantics: it is optional (every Item published before the
field existed simply omits it), nothing in §4–§8 derives from it, and
`schema_version` stays `1`. Because §2 is `.strict()`, a consumer still running
pre-extension v1 tooling rejects Items that carry the field — the Web
repository's schema must therefore be deployed **before** any producer starts
emitting it.

## 3. Briefing Schema

A **Briefing** is the daily digest for one (date, category) pair. The
authoritative definition is `briefingSchema` in `src/lib/schemas.ts`.

| Field | Required | Default | Constraint |
| --- | --- | --- | --- |
| `schema_version` | ✔ | — | literal `1` |
| `id` | ✔ | — | **must equal** `{category}-{date}` (deterministic, validated) |
| `category` | ✔ | — | category enum |
| `date` | ✔ | — | `YYYY-MM-DD` |
| `title` | ✔ | — | non-empty |
| `generated_at` | ✔ | — | ISO 8601 timestamp with timezone |
| `published_at` | ✔ | — | ISO 8601 timestamp with timezone |
| `updated_at` | ✖ | falls back to `published_at` | ISO 8601 timestamp with timezone |
| `item_ids` | ✖ | `[]` | stable IDs of member items |

The Markdown body holds the full human-readable daily report. The
Briefing → Item relationship, however, is **only** expressed through
`item_ids` (stable IDs), never through prose links.

## 4. Stable Identity

- **Item identity** = the `id` field. Nothing else.
  - Forbidden as identity: `hash(title)`, title slugs, Markdown filenames, array positions.
  - Example: `id = openreview-example-001` ⇒ the item is forever addressable at
    `/papers/openreview-example-001/`, regardless of any title change.
- **Briefing identity** = `({category}, {date})`, serialized as `{category}-{date}`.
  - Same day + same category ⇒ exactly one canonical briefing.
  - Regenerating a briefing for an existing (date, category) **updates the
    existing briefing**; it must never create `briefing-v2` / `briefing-2`.

## 5. Immutability Contract

After an Item is **first publicly published**:

**Immutable (publication identity):**

- `id`
- `category`

**Mutable (content updates):**

- `title`, `summary`, `why_it_matters`, `tags`, `authors`
- `source` metadata (as long as canonical identity is unchanged)
- `updated_at`

**Category mutation is an identity migration, not an update.** Because the
canonical URL and the RSS GUID are derived from `(category, id)`, changing
`category` on a published Item:

- changes the canonical URL (`/resource/github-foo/` → `/code/github-foo/`),
- changes the RSS GUID,
- breaks existing external links and SEO identity.

Therefore the WebPublisher must **never silently mutate** the category of an
already-published Item. If a category migration is ever truly required it is an
explicit, deliberate operation (out of scope for v1; no redirect store exists).

## 6. Canonical URL Contract

| Entity | URL shape | Example |
| --- | --- | --- |
| Item | `/{category-slug}/{item-id}/` | `/papers/openreview-example-001/` |
| Briefing | `/daily/{date}/{category-slug}/` | `/daily/2026-08-26/papers/` |
| Daily | `/daily/{date}/` | `/daily/2026-08-26/` |
| Category | `/{category-slug}/` | `/ai-news/` |
| Archive | `/archive/` | — |
| Home | `/` | — |

- **Item title NEVER participates in the canonical URL.**
- URL builders live in `src/lib/urls.ts` (paths) and `src/lib/identity.ts`
  (absolute canonical URLs); every page, card, feed and sitemap entry derives
  from these functions — the URL contract is enforced by construction.
- Deployment has three explicit URL layers:
  - **Logical route**: `/papers/openreview-example-001/`, which never contains
    the deployment base and is the route/identity layer.
  - **Browser href**: `/dailyinfo-web/papers/openreview-example-001/`, produced
    by `withBase(logicalRoute)` for the current GitHub Pages Project Site.
  - **Absolute public URL**:
    `https://iheadwater.github.io/dailyinfo-web/papers/openreview-example-001/`,
    produced by `absoluteUrl(logicalRoute)` for canonical, `og:url`, RSS,
    robots and sitemap output.
- Current production deployment is
  `SITE_ORIGIN=https://iheadwater.github.io` + `SITE_BASE=/dailyinfo-web`,
  yielding `https://iheadwater.github.io/dailyinfo-web/`. The future custom-domain
  deployment is `SITE_ORIGIN=https://daily.iheadwater.org` + `SITE_BASE=/`;
  changing those settings must not change the logical route or Item identity.

## 7. Briefing ↔ Item Relationship Contract

Bidirectional by stable ID:

```text
Briefing.item_ids contains X  ⇔  X.briefing_ids contains Briefing.id
```

Plus:

- `Briefing.category === Item.category` for every member (a papers briefing
  cannot contain a code item) unless a future schema version explicitly
  changes this.
- Every referenced ID must resolve; dangling references fail the build.

## 8. RSS GUID Contract

```text
RSS GUID = canonical Item URL   (isPermaLink="true")
```

Consequences:

- Same publication identity ⇒ same GUID, across builds, forever.
- `title` / `summary` / `tags` updates never change the GUID.
- A category mutation would change the GUID — which is exactly why category
  mutation is forbidden (§5).
- GUIDs are constructed in `src/lib/identity.ts` (`itemGuid`), which by
  construction returns the canonical URL.

### Deployment Note

The v1 contract intentionally keeps `RSS GUID = canonical Item URL`, so the
GUID includes the current deployment origin and base. Before real readers
subscribe to RSS, complete the final domain migration to
`https://daily.iheadwater.org/`. If real subscribers already exist when the
domain changes, RSS GUID compatibility must be designed as a separate
migration; this deployment fix does not change the v1 RSS contract.

## 9. Schema Version Contract

- Current: `schema_version: 1`.
- **Unknown future schema versions fail closed.** A file declaring
  `schema_version: 2` is rejected by v1 tooling; no compatibility guessing, no
  auto-migration. Supporting a new version requires explicit new tooling.

## 10. Validation Ownership

Two validators with distinct, non-overlapping responsibilities:

**Schema Validator — `src/lib/schemas.ts` (zod)**

Owns single-object, single-field structural constraints: required fields, field
types, enums, `schema_version` literal, ID syntax, URL syntax, timestamp
syntax, language enum, array shapes, unknown-key rejection.

**Integrity Validator — `src/lib/validate-content.ts`**

Owns cross-object / cross-collection relationship constraints: duplicate Item
and Briefing IDs, Briefing id determinism, Briefing↔Item reference resolution
and bidirectional membership, category consistency, source display-label
consistency (§11 rule 9), plus one re-applied schema rule (http(s) source URL)
that guards against the stale-cache behavior below.

**Entry points — the same core, never duplicated:**

```text
src/lib/validate-content.ts   (shared core)
        ├── scripts/validate-content.mjs   CLI gate  (npm run validate)
        └── src/lib/content.ts             build gate (astro build, loadSiteContent)
```

### W1-001 root cause (investigated & pinned)

Phase 1 observed "astro build skips zod `.refine()`". The verified root cause
is different and broader: **Astro 5's content-layer glob loader caches parsed
entries in `node_modules/.astro/data-store.json`, keyed by `(entry id, file
content digest)` — the collection schema is not part of the cache key.** When
any schema constraint is tightened, entries whose file content is unchanged
are never re-parsed, so the cached "valid" verdict is served even though the
current schema would reject the data.

Verified behavior matrix (Astro 5.18.2, zod 3.25.76 via `astro/zod`):

| Path | `.refine()` enforced? |
| --- | --- |
| Direct zod `safeParse` / `safeParseAsync` | yes |
| `npm run validate` (reads files fresh) | yes |
| `astro build` with a fresh/empty cache (e.g. CI `npm ci`) | **yes** |
| `astro build` with a stale cache after schema tightening | **no — cached verdict reused** |
| `astro build --force` (clears content cache) | yes |

The regression suite pins this: `scripts/contract-tests.mjs` section 5 runs
`tests/refine-probe` and asserts the full matrix, including the stale-cache
gotcha. If Astro fixes cache invalidation, the pinned assertion fails and the
`validateSkippedSchemaRules` guard can be re-evaluated.

Practical consequences:

- CI is unaffected: `npm ci` produces a fresh store, so `astro build` alone
  enforces the complete schema there.
- Local development: after editing `src/lib/schemas.ts`, run
  `astro build --force` (or remove `node_modules/.astro`) to re-validate
  unchanged content files.
- The build gate additionally re-applies the http(s) URL rule in
  `validateSkippedSchemaRules` so `astro build` stays fail-closed even against
  a stale cache.

## 11. Requirements for the dailyinfo WebPublisher (Phase 2D)

The WebPublisher in the `dailyinfo` repository writes Publication
content into this repository. Its output **must** satisfy:

1. **Item stable IDs**: globally unique, `^[a-z0-9][a-z0-9._-]*$`, assigned at
   creation and never recycled; never derived from titles or filenames.
2. **Canonical category**: a valid v1 category per Item; **category and id are
   immutable after first publish** — updating a published Item must preserve
   both.
3. **schema_version = 1** on every emitted Item and Briefing.
4. **Valid timestamps**: ISO 8601 with timezone for all supplied `*_at` fields;
  `YYYY-MM-DD` for briefing `date`.
   `source_published_at` may be explicit `null` when the upstream source does
   not provide a reliable publication time; consumers must not fabricate one.
5. **Valid source URLs**: absolute http(s) URLs.
6. **Deterministic Briefing IDs**: `{category}-{date}`; regenerating the same
   (date, category) updates the existing briefing — no `-v2` variants.
7. **All references resolvable**: every `briefing.item_ids` entry exists as an
   Item, and membership is bidirectional (`item.briefing_ids` lists back).
8. **Category consistency**: briefing category equals every member item's
   category.
9. **Consistent `source.display_name`**: when emitted, it must come from the
   source registry's `display_name` and be identical for every Item sharing a
   `source.name`. Omit it (or emit explicit `null`) rather than inventing a
   display string; a source whose Items disagree fails the Web build.

**dailyinfo-web does not guess, repair, or silently tolerate malformed
publications.** Every rule above fails the build (fail closed). The WebPublisher
must fix data at the source; the web layer is a verifier, not a healer.

## 12. Semantic Contract vs. Storage Representation

This document freezes the **semantic** publication contract. The current Astro
storage representation — Markdown files with YAML frontmatter under
`src/content/items/generated/` and `src/content/briefings/generated/` — is an implementation
detail:

- A Markdown file is **not** the Item identity and **not** the cross-repo
  contract itself.
- Phase 2D may switch to `items/*.json` or another representation without
 changing identity/schema semantics; only the loaders in
 `src/content.config.ts` would change.
- Conversely, renaming a content file changes nothing about identity or URLs.
