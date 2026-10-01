import {
  itemSchema,
  briefingSchema,
  isHttpUrl,
  HTTP_URL_MESSAGE,
  type ItemData,
  type BriefingData,
} from './schemas.ts';
import { briefingId } from './identity.ts';
import { sourceDisplayName } from './sources.ts';

/**
 * Shared validation core — the single implementation of the publication
 * contract checks. Two entry points consume it so the rules can never drift:
 *
 *   - scripts/validate-content.mjs   (CLI gate: `npm run validate`)
 *   - src/lib/content.ts             (build gate: `astro build`)
 *
 * Ownership (frozen in docs/contracts/publication-v1.md):
 *
 *   Schema Validator (src/lib/schemas.ts, zod)
 *     → single-object, single-field structural constraints
 *
 *   Integrity Validator (this file)
 *     → cross-object / cross-collection relationship constraints
 *     → re-application of the one schema rule Astro's content cache can
 *       serve stale (see validateSkippedSchemaRules)
 */

export interface LabeledItem {
  /** Human-readable origin label for error messages, e.g. "items/foo.md". */
  file: string;
  data: ItemData;
}

export interface LabeledBriefing {
  file: string;
  data: BriefingData;
}

export interface SchemaIssue {
  file: string;
  path: string;
  message: string;
}

export interface ParseResult<T> {
  data?: T;
  issues: SchemaIssue[];
}

function toIssues(file: string, error: { issues: { path: PropertyKey[]; message: string }[] }): SchemaIssue[] {
  return error.issues.map((issue) => ({
    file,
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

/** Parse raw frontmatter data against the Item schema. */
export function parseItemFrontmatter(raw: unknown, file: string): ParseResult<ItemData> {
  const result = itemSchema.safeParse(raw);
  if (result.success) return { data: result.data, issues: [] };
  return { issues: toIssues(file, result.error) };
}

/** Parse raw frontmatter data against the Briefing schema. */
export function parseBriefingFrontmatter(raw: unknown, file: string): ParseResult<BriefingData> {
  const result = briefingSchema.safeParse(raw);
  if (result.success) return { data: result.data, issues: [] };
  return { issues: toIssues(file, result.error) };
}

/**
 * Re-apply schema-level rules that Astro's content-layer cache can bypass.
 *
 * Root cause (W1-001, see docs/contracts/publication-v1.md): the glob loader
 * caches parsed entries in node_modules/.astro/data-store.json keyed by
 * (entry id, file digest) — the schema is NOT part of the key. When a schema
 * constraint is tightened, entries whose file content is unchanged are never
 * re-parsed, so the cached "valid" verdict is served even though the current
 * schema would reject the data. Re-applying the rule here keeps `astro build`
 * alone fail-closed regardless of cache state.
 */
export function validateSkippedSchemaRules(items: LabeledItem[]): string[] {
  const problems: string[] = [];
  for (const { file, data } of items) {
    if (typeof data.source?.url !== 'string' || !isHttpUrl(data.source.url)) {
      problems.push(`${file}: source.url: ${HTTP_URL_MESSAGE} (got ${JSON.stringify(data.source?.url)})`);
    }
  }
  return problems;
}

/**
 * Cross-object publication integrity. All rules fail closed.
 *
 *   - duplicate stable Item / Briefing ids
 *   - Briefing id determinism (must equal `${category}-${date}`)
 *   - Briefing.item_ids → Item exists
 *   - Item.briefing_ids → Briefing exists
 *   - bidirectional membership consistency (both directions)
 *   - Briefing.category === Item.category for every member
 */
export function validatePublicationIntegrity(
  items: LabeledItem[],
  briefings: LabeledBriefing[],
): string[] {
  const problems: string[] = [];

  const itemsById = new Map<string, LabeledItem>();
  for (const item of items) {
    const existing = itemsById.get(item.data.id);
    if (existing) {
      problems.push(
        `duplicate Item id "${item.data.id}" (${existing.file} and ${item.file})`,
      );
    } else {
      itemsById.set(item.data.id, item);
    }
  }

  const briefingsById = new Map<string, LabeledBriefing>();
  for (const briefing of briefings) {
    const existing = briefingsById.get(briefing.data.id);
    if (existing) {
      problems.push(
        `duplicate Briefing id "${briefing.data.id}" (${existing.file} and ${briefing.file})`,
      );
    } else {
      briefingsById.set(briefing.data.id, briefing);
    }
  }

  for (const { file, data } of briefings) {
    const expected = briefingId(data.category, data.date);
    if (data.id !== expected) {
      problems.push(`${file}: Briefing id "${data.id}" must equal "${expected}" (category-date)`);
    }
  }

  for (const { file, data } of briefings) {
    for (const itemId of data.item_ids) {
      const item = itemsById.get(itemId);
      if (!item) {
        problems.push(`${file}: references missing item "${itemId}"`);
        continue;
      }
      if (item.data.category !== data.category) {
        problems.push(
          `${file}: category ${data.category} includes item "${itemId}" of category ${item.data.category}`,
        );
      }
      if (!item.data.briefing_ids.includes(data.id)) {
        problems.push(
          `${file}: includes item "${itemId}" which does not list briefing "${data.id}" in briefing_ids`,
        );
      }
    }
  }

  for (const { file, data } of items) {
    for (const briefingRef of data.briefing_ids) {
      const briefing = briefingsById.get(briefingRef);
      if (!briefing) {
        problems.push(`${file}: references missing briefing "${briefingRef}"`);
        continue;
      }
      if (!briefing.data.item_ids.includes(data.id)) {
        problems.push(
          `${file}: lists briefing "${briefingRef}" which does not include the item`,
        );
      }
    }
  }

  return problems;
}

/**
 * Every Item sharing a `source.name` must resolve to the same display label.
 *
 * The grouping helpers label a group from the first Item they see, so
 * disagreement would silently render one journal under different names on
 * different pages (the category page and the briefing page traverse Items in
 * different orders).
 *
 * Compares the RESOLVED label (`display_name ?? name`), not the raw field —
 * that is the value actually rendered, and it is the only comparison that does
 * not fail closed on a set that renders identically. Two shapes that must NOT
 * be reported: an Item carrying `display_name` equal to its `source.name` mixed
 * with Items that omit the field, and `null` mixed with omission. Publishers
 * that adopt the field later (see docs/contracts/publication-v1.md §2) rely on
 * exactly this: existing Items omit it while new ones may carry the fallback.
 *
 * Frozen in docs/contracts/publication-v1.md §11 requirement 9.
 */
export function validateConsistentSourceLabels(items: LabeledItem[]): string[] {
  const problems: string[] = [];
  const firstSeen = new Map<string, { file: string; label: string }>();

  for (const { file, data } of items) {
    // The very function the pages render with — reusing it rather than
    // re-deriving the fallback is what keeps this rule from drifting away
    // from the thing it is meant to protect.
    const label = sourceDisplayName(data.source);
    const known = firstSeen.get(data.source.name);
    if (!known) {
      firstSeen.set(data.source.name, { file, label });
      continue;
    }
    if (known.label !== label) {
      problems.push(
        `${file}: source "${data.source.name}" renders as ${JSON.stringify(label)} ` +
          `but ${known.file} renders as ${JSON.stringify(known.label)}`,
      );
    }
  }

  return problems;
}

/**
 * Full post-parse validation for already-parsed collections.
 * Called by both the CLI gate and the build gate (loadSiteContent).
 */
export function validateParsedCollections(
  items: LabeledItem[],
  briefings: LabeledBriefing[],
): string[] {
  return [
    ...validateSkippedSchemaRules(items),
    ...validateConsistentSourceLabels(items),
    ...validatePublicationIntegrity(items, briefings),
  ];
}

/** Format problems into the fail-closed error message used by both gates. */
export function formatProblems(problems: string[]): string {
  return `Content validation failed (${problems.length} problem(s)):\n  - ${problems.join('\n  - ')}`;
}
