// @ts-check
import { defineConfig } from 'astro/config';

const SITE_URL = process.env.SITE_URL || 'https://localsknow.com.au';

/**
 * Static output. Every page in this directory is a file on disk, which is the
 * only way a 20k page site survives a crawl budget conversation.
 *
 * Sitemaps are hand rolled in scripts/postbuild.mjs rather than @astrojs/sitemap,
 * because the spec calls for them split by type and state with honest lastmod,
 * and the integration cannot express the indexation policy in src/lib/indexability.ts.
 */
export default defineConfig({
  site: SITE_URL,
  output: 'static',
  trailingSlash: 'always',
  compressHTML: true,
  build: {
    format: 'directory',
    inlineStylesheets: 'auto',
  },
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },
  devToolbar: { enabled: false },
  vite: {
    build: {
      assetsInlineLimit: 2048,
    },
  },
});
