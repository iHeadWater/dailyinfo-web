import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import rehypeSanitize from 'rehype-sanitize';

/**
 * Render an Item summary to sanitized HTML.
 *
 * Summaries used to be rendered as plain text, so markdown the producer emitted
 * — `## 🧠 模型进展` section headings, `**bold**` — reached the page as literal
 * characters. Briefing bodies already go through this pipeline via
 * astro:content; this gives summaries the same treatment.
 *
 * Feed this the RAW `item.data.summary`. Pre-decoding HTML entities (as
 * formatDisplayText does for plain-text consumers) would let entity-escaped
 * markup become live markup again: `&lt;script&gt;` would decode to a raw node
 * and be dropped by the sanitizer, silently deleting the word between the tags.
 *
 * Two processor options are deliberate and pinned by scripts/contract-tests.mjs:
 *
 *   - `smartypants: false` — it defaults to ON, and its typographic
 *     substitutions rewrite the producer's straight quotes into curly ones,
 *     silently editing content this layer is supposed to render verbatim.
 *   - `rehypeSanitize` — the same plugin astro.config.ts applies to briefing
 *     bodies. A summary is LLM output derived from external sources, i.e.
 *     untrusted input, and the result is injected with `set:html`.
 *
 * Sanitizing is the ONLY barrier against raw HTML here: Astro's pipeline always
 * includes `rehype-raw` and allows dangerous HTML through remarkRehype, so raw
 * nodes reach these plugins intact and are discarded by the sanitizer. Remove
 * it and the same input renders live `<script>`.
 *
 * Note this is a deliberately separate pipeline instance from the one
 * astro.config.ts configures for collection bodies. Keep the two option sets in
 * step: a remark/rehype plugin added there will not reach summaries.
 *
 * Node-safe on purpose: scripts/contract-tests.mjs imports this module
 * directly, so it must not import anything from `astro:*`.
 */

/** Minimal hast shape — avoids pulling in hast types for one small walk. */
interface HastNode {
  type: string;
  tagName?: string;
  children?: HastNode[];
}

const HEADING_TAG = /^h([1-6])$/;

/**
 * Shift every heading down one level.
 *
 * A summary renders inside a panel whose own label is an `<h2>`, so the
 * sections it carries have to sit below that: otherwise a screen-reader heading
 * list cannot tell a page section from a summary subsection, and a
 * producer-supplied `#` would render a second `<h1>` at article-title scale.
 */
function shiftHeadingsDown() {
  return (tree: HastNode): void => {
    const walk = (node: HastNode): void => {
      if (node.type === 'element' && node.tagName) {
        const match = HEADING_TAG.exec(node.tagName);
        if (match) node.tagName = `h${Math.min(6, Number(match[1]) + 1)}`;
      }
      node.children?.forEach(walk);
    };
    walk(tree);
  };
}

type MarkdownProcessor = Awaited<ReturnType<typeof createMarkdownProcessor>>;

/** Built once: constructing a processor is not free, and options never vary. */
let processor: Promise<MarkdownProcessor> | undefined;

export async function renderSummaryMarkdown(markdown: string): Promise<string> {
  processor ??= createMarkdownProcessor({
    smartypants: false,
    rehypePlugins: [shiftHeadingsDown, rehypeSanitize],
  }).catch((error: unknown) => {
    // Never cache a rejection: in `astro dev` a transient plugin-load failure
    // would otherwise poison every later render with the same stale error.
    processor = undefined;
    throw error;
  });
  const { code } = await (await processor).render(markdown);
  return code;
}

/**
 * Sentinel shielding a code span's literal text from the marker passes. NUL
 * cannot occur in the summaries we render, and it matches none of the patterns
 * below.
 */
const CODE_SPAN_SENTINEL = String.fromCharCode(0);

/**
 * One character that micromark does NOT treat as word-internal when deciding
 * whether `_` may open or close emphasis.
 *
 * The class has to mirror micromark's own classification, which works on
 * UTF-16 code units: astral code points (every SMP emoji) look like lone
 * surrogates there and end up counted as neither whitespace nor punctuation,
 * and combining marks and format characters behave the same way. Treating any
 * of them as a boundary would delete underscores the renderer keeps — e.g.
 * `😀_重要_😀` or `⚠️_注意_⚠️`.
 */
const NOT_WORD_INTERNAL = '[^\\p{L}\\p{N}\\p{M}\\p{Cf}_\\u{10000}-\\u{10FFFF}]';

const UNDERSCORE_STRONG = new RegExp(
  `(^|${NOT_WORD_INTERNAL})__(?=\\S)([^_]+?)(?<=\\S)__(?=${NOT_WORD_INTERNAL}|$)`,
  'gu',
);
const UNDERSCORE_EMPHASIS = new RegExp(
  `(^|${NOT_WORD_INTERNAL})_(?=\\S)([^_]+?)(?<=\\S)_(?=${NOT_WORD_INTERNAL}|$)`,
  'gu',
);

/**
 * Strip markdown structure for contexts that render plain text rather than
 * HTML: the list card previews, the RSS descriptions (both of which truncate)
 * and the meta description.
 *
 * Deliberately shallow — it drops structural markers (headings, list and quote
 * markers, link and image syntax, emphasis, code ticks) and flattens newlines,
 * but never reorders or invents text, and never drops characters that could be
 * prose. These callers cannot use renderSummaryMarkdown: truncating rendered
 * HTML would cut tags in half.
 *
 * Where a rule cannot tell markup from ordinary text it stays its hand: losing
 * a `*` from `5*8=40` is a visible defect, while leaving an emphasised span
 * un-stripped is merely cosmetically imperfect in a one-line preview.
 *
 * The boundary guards differ per delimiter because CommonMark's rules do:
 * `_` cannot emphasise inside a word (Unicode-aware, so `进展_重要_突破`
 * renders literally) while `*` can.
 */
export function markdownToPlainText(markdown: string): string {
  // Code spans are literal in markdown, so shield their contents up front —
  // otherwise `data_2026_08.csv` would lose its underscores to the rule below.
  // If the input already carries the sentinel, shielding is skipped rather than
  // mis-indexing: the restore step keys off the spans collected here.
  const codeSpans: string[] = [];
  const shielded = markdown.includes(CODE_SPAN_SENTINEL)
    ? markdown
    : markdown.replace(/`{1,3}([^`]+?)`{1,3}/g, (_match, code: string) => {
        codeSpans.push(code);
        return `${CODE_SPAN_SENTINEL}${codeSpans.length - 1}${CODE_SPAN_SENTINEL}`;
      });

  const stripped = shielded
    .replace(/^ {0,3}#{1,6}\s+/gm, '')
    .replace(/^ {0,3}>\s?/gm, '')
    // A marker must be followed by content on the same line: a lone `+` or `-`
    // is prose, and CommonMark does not let it interrupt a paragraph.
    .replace(/^ {0,3}(?:[-*+]|\d+[.)])[ \t]+(?=\S)/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    // Strong before emphasis, so `**x**` is consumed rather than left as `*x*`.
    // Asterisks keep an ASCII `\w` boundary, which makes this stricter than the
    // renderer for ASCII neighbours (`5*8=40` survives, where CommonMark would
    // read an emphasis span) and looser for non-ASCII punctuation (`中*(b)*文`
    // loses the asterisks the renderer keeps). Matching the renderer exactly
    // would mean implementing its flanking rules; the asymmetry is accepted
    // because leaving a marker is cheaper than deleting a multiplication sign,
    // and no summary in the corpus reaches either shape.
    .replace(/(^|[^\w])\*\*(?=\S)(.+?)(?<=\S)\*\*(?=[^\w]|$)/g, '$1$2')
    .replace(/(^|[^\w])\*(?=\S)(.+?)(?<=\S)\*(?=[^\w]|$)/g, '$1$2')
    // Underscores instead forbid intraword emphasis, so their boundaries must
    // match micromark's word-internal class — see NOT_WORD_INTERNAL.
    .replace(UNDERSCORE_STRONG, '$1$2')
    .replace(UNDERSCORE_EMPHASIS, '$1$2');

  return (codeSpans.length === 0
    ? stripped
    : stripped.replace(
        new RegExp(`${CODE_SPAN_SENTINEL}(\\d+)${CODE_SPAN_SENTINEL}`, 'g'),
        (_match, index: string) => codeSpans[Number(index)],
      )
  )
    .replace(/\s+/g, ' ')
    .trim();
}
