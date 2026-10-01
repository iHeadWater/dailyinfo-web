import rss from '@astrojs/rss';
import { SITE } from '../../lib/site.ts';
import { CATEGORY_BY_ID, CATEGORIES } from '../../lib/categories.ts';
import { loadSiteContent } from '../../lib/content.ts';
import { itemCanonicalUrl, itemGuid } from '../../lib/identity.ts';
import { truncate } from '../../lib/format.ts';
import { summaryPlainText } from '../../lib/markdown.ts';

/**
 * Per-category feed: /feed/{category-slug}.xml
 *
 * Single implementation shared by all categories — adding a category in
 * categories.ts automatically adds its feed route. GUID === canonical Item
 * URL (identity.ts), stable across builds.
 */
export async function getStaticPaths() {
  return CATEGORIES.map((category) => ({
    params: { category: category.slug },
    props: { categoryId: category.id },
  }));
}

export async function GET(context) {
  const { categoryId } = context.props;
  const category = CATEGORY_BY_ID[categoryId];
  const site = await loadSiteContent();
  return rss({
    title: `${SITE.name} · ${category.label}`,
    description: category.description,
    site: SITE.publicUrl,
    items: await Promise.all(
      site.itemsByCategory[category.id].map(async (item) => ({
        title: item.data.title,
        link: itemCanonicalUrl(item.data.category, item.data.id),
        // Plain text: a feed reader would otherwise show `## 🧠 模型进展` verbatim.
        description: truncate(await summaryPlainText(item.data.summary), 300),
        pubDate: new Date(item.data.published_at),
        categories: [category.label],
        customData: `<guid isPermaLink="true">${itemGuid(item.data.category, item.data.id)}</guid>`,
      })),
    ),
  });
}
