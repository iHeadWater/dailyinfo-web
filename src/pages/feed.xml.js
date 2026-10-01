import rss from '@astrojs/rss';
import { SITE } from '../lib/site.ts';
import { CATEGORY_BY_ID } from '../lib/categories.ts';
import { loadSiteContent } from '../lib/content.ts';
import { itemCanonicalUrl, itemGuid } from '../lib/identity.ts';
import { truncate } from '../lib/format.ts';
import { summaryPlainText } from '../lib/markdown.ts';

/**
 * Global feed: /feed.xml
 *
 * Entries are Items (never whole Briefings). The GUID is the canonical Item
 * URL derived from the stable item id (identity.ts guarantees GUID === URL),
 * so it never changes between builds.
 */
export async function GET() {
  const site = await loadSiteContent();
  return rss({
    title: `${SITE.name}`,
    description: SITE.description,
    site: SITE.publicUrl,
    items: await Promise.all(
      site.items.map(async (item) => ({
        title: item.data.title,
        link: itemCanonicalUrl(item.data.category, item.data.id),
        // Plain text: a feed reader would otherwise show `## 🧠 模型进展` verbatim.
        description: truncate(await summaryPlainText(item.data.summary), 300),
        pubDate: new Date(item.data.published_at),
        categories: [CATEGORY_BY_ID[item.data.category].label],
        customData: `<guid isPermaLink="true">${itemGuid(item.data.category, item.data.id)}</guid>`,
      })),
    ),
  });
}
