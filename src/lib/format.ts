/**
 * Deterministic UTC formatting helpers.
 *
 * Build output must not depend on the host locale or timezone, so all
 * formatting is done on the ISO string / UTC value directly.
 */

export function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

export function formatDateTime(iso: string): string {
  const u = new Date(iso).toISOString();
  return `${u.slice(0, 10)} ${u.slice(11, 16)} UTC`;
}

const EDITORIAL_MONTHS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
] as const;

/** Compact, locale-independent publication date (for example, 27 AUG 2026). */
export function formatEditorialDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-');
  const monthLabel = EDITORIAL_MONTHS[Number(month) - 1] ?? month;
  return `${day} ${monthLabel} ${year}`;
}

/** Locale-independent month label for publication archive headings. */
export function formatEditorialMonth(isoMonth: string): string {
  const month = isoMonth.slice(5, 7);
  return EDITORIAL_MONTHS[Number(month) - 1] ?? month;
}

const DISPLAY_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  middot: '·',
  nbsp: ' ',
  quot: '"',
};

/**
 * Decode common source-system entities for text rendering only.
 *
 * Astro still escapes the returned text when it is interpolated, so this
 * never turns source content into HTML. Two passes handle feeds that encode
 * an entity twice (for example `&amp;quot;`).
 */
export function formatDisplayText(value: string): string {
  let output = value;
  for (let pass = 0; pass < 2; pass += 1) {
    const decoded = output.replace(
      /&(#\d+|#x[\da-f]+|amp|apos|gt|lt|middot|nbsp|quot);/gi,
      (_match, entity: string) => {
        if (entity.startsWith('#x') || entity.startsWith('#X')) {
          const codePoint = Number.parseInt(entity.slice(2), 16);
          return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : _match;
        }
        if (entity.startsWith('#')) {
          const codePoint = Number.parseInt(entity.slice(1), 10);
          return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : _match;
        }
        return DISPLAY_ENTITIES[entity.toLowerCase()] ?? _match;
      },
    );
    if (decoded === output) break;
    output = decoded;
  }
  return output;
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}
