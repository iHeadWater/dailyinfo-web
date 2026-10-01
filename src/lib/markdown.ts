import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import rehypeSanitize from 'rehype-sanitize';
import { formatDisplayText } from './format.ts';

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
 * The text a browser would show for rendered summary HTML.
 *
 * `<img>` becomes its alt text before tags are stripped — the alt is visible
 * text, so dropping the tag outright would lose it. Entities are decoded last,
 * because the HTML carries them escaped; feed writers re-escape afterwards.
 */
function htmlToText(html: string): string {
  return formatDisplayText(
    html
      .replace(/<img\b[^>]*\balt="([^"]*)"[^>]*>/g, '$1')
      .replace(/<img\b[^>]*>/g, '')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Plain-text rendering of a summary, for the contexts that cannot take HTML:
 * the list card previews, the RSS descriptions and the meta description.
 *
 * Derived from the renderer rather than re-derived by hand. Three review rounds
 * each found a fresh divergence while that was done with regexes — intraword
 * underscores (`model_name`), arithmetic asterisks (`5*8`), backslash escapes,
 * astral neighbours (`😀_重要_😀`), a `2.` that cannot interrupt a paragraph,
 * markers inside code spans — because matching CommonMark means implementing
 * its flanking rules, not tuning a character class. Taking the renderer's own
 * output cannot drift from it.
 *
 * The cost is that a shape the renderer misreads is misread here too: `5*8=40`
 * loses its asterisks, because CommonMark reads an emphasis span. The item page
 * shows the same thing, so card and page agree — the property that matters.
 */
export async function summaryPlainText(markdown: string): Promise<string> {
  return htmlToText(await renderSummaryMarkdown(markdown));
}
