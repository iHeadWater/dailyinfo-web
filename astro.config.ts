import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import rehypeSanitize from 'rehype-sanitize';
import { SITE } from './src/lib/site.ts';

// Security: publication Markdown is treated as untrusted content.
// rehype-sanitize strips raw HTML (script, iframe, event handlers, ...)
// before Briefing bodies are rendered to static HTML.
//
// site + base come from the single deployment config in src/lib/site.ts
// (current: GitHub Pages project site https://iheadwater.github.io/dailyinfo-web/).
export default defineConfig({
  site: SITE.origin,
  base: SITE.base || '/',
  output: 'static',
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/feed') && !/\/404\/?$/.test(page),
    }),
  ],
  markdown: {
    rehypePlugins: [rehypeSanitize],
  },
});
