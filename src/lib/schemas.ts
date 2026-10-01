import { z } from 'astro/zod';
import { CATEGORY_IDS } from './categories.ts';

/**
 * Content contracts for the two publication collections (Item / Briefing).
 *
 * These schemas are the build-time contract: `astro build` fails closed on
 * any violation. They are also reused by scripts/validate-content.mjs so
 * the standalone validation step checks exactly the same rules.
 *
 * Note: `.strict()` rejects unknown keys — a typo'd field name fails the
 * build instead of being silently dropped.
 */

const STABLE_ID = /^[a-z0-9][a-z0-9._-]*$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:?\d{2})$/;

/**
 * YAML frontmatter may coerce unquoted timestamps into Date objects.
 * Normalize them back to ISO strings before validating, so both quoted
 * and unquoted YAML timestamps are accepted and canonicalized.
 */
const isoDate = z.preprocess(
  (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : value),
  z.string().regex(DATE_ONLY, { message: 'must be a YYYY-MM-DD date' }),
);

const isoTimestamp = z.preprocess(
  (value) => (value instanceof Date ? value.toISOString() : value),
  z.string().regex(ISO_TIMESTAMP, {
    message: 'must be an ISO 8601 timestamp with timezone, e.g. 2026-08-26T01:00:00Z',
  }),
);

const stableId = z.string().regex(STABLE_ID, {
  message: 'stable ids must match [a-z0-9][a-z0-9._-]*',
});

/**
 * Shared http(s) predicate + message for source URLs.
 *
 * zod's `.url()` alone accepts any parseable URL scheme (ftp://, file://, ...),
 * so the http(s) restriction is a refinement. The predicate is exported because
 * the build path re-applies this rule outside zod — see
 * src/lib/validate-content.ts and docs/contracts/publication-v1.md
 * ("Validation Ownership") for why.
 */
export const HTTP_URL_MESSAGE = 'source url must be an absolute http(s) URL';
export function isHttpUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://');
}

/** Source URLs must be absolute http(s) links (zod's .url() alone accepts ftp:// etc.). */
const httpUrl = z.string().url().refine(isHttpUrl, { message: HTTP_URL_MESSAGE });

export const itemSchema = z
  .object({
    schema_version: z.literal(1),
    /** Stable, globally-unique identity of the Item. Never derived from the title. */
    id: stableId,
    category: z.enum(CATEGORY_IDS),
    title: z.string().min(1),
    source: z
      .object({
        name: z.string().min(1),
        /**
         * Human-readable source name, supplied by the producer from its
         * source registry (e.g. journal_hydrology -> "Journal of Hydrology").
         * Display/grouping only — never part of identity, URLs or GUIDs.
         * Optional and nullable: Python serializes "no value" as null, and
         * every Item published before this field existed simply omits it.
         */
        display_name: z.string().min(1).nullable().optional(),
        url: httpUrl,
        external_id: z.string().min(1).optional(),
      })
      .strict(),
    authors: z.array(z.string().min(1)).default([]),
    /** When the original source published the content. */
    source_published_at: isoTimestamp.nullable(),
    /** When DailyInfo retrieved the source. */
    retrieved_at: isoTimestamp,
    /** When DailyInfo published this Item publicly. */
    published_at: isoTimestamp,
    updated_at: isoTimestamp.optional(),
    summary: z.string().min(1),
    why_it_matters: z.string().min(1).nullable().optional(),
    tags: z.array(z.string().min(1)).default([]),
    language: z.enum(['zh-CN', 'en']).default('zh-CN'),
    briefing_ids: z.array(stableId).default([]),
  })
  .strict();

export const briefingSchema = z
  .object({
    schema_version: z.literal(1),
    /** Deterministic Briefing identity: `${category}-${date}`. */
    id: stableId,
    category: z.enum(CATEGORY_IDS),
    date: isoDate,
    title: z.string().min(1),
    generated_at: isoTimestamp,
    published_at: isoTimestamp,
    updated_at: isoTimestamp.optional(),
    item_ids: z.array(stableId).default([]),
  })
  .strict();

export type ItemData = z.infer<typeof itemSchema>;
export type BriefingData = z.infer<typeof briefingSchema>;
