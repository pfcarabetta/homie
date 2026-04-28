#!/usr/bin/env node
/**
 * Post-build step: emit per-route static HTML files with route-specific
 * meta tags (title, description, og:*, twitter:*) baked into the head.
 *
 * Why: link-unfurling crawlers (iMessage, Slack, Twitter, WhatsApp,
 * Discord) don't execute JavaScript, so react-helmet-async never runs
 * before they snapshot the page. Without a route-specific HTML file,
 * every URL on the SPA shows the homepage's OG card.
 *
 * Vite outputs a single `dist/index.html`. We read it, swap the head
 * meta tags for each route below, and write the result to
 * `dist/<route>.html`. A matching rewrite in vercel.json points the
 * route's URL to that file. The browser still sees the original URL
 * (rewrites are server-side), so React Router takes over after mount.
 *
 * To add a new route: append to PAGES below + add a rewrite in
 * vercel.json. No other wiring needed.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(__dirname, '..', 'dist');
const SRC = resolve(DIST, 'index.html');

const BASE_URL = 'https://homiepro.ai';

/** @type {Array<{ outFile: string; canonical: string; title: string; description: string; ogImage?: string; twitterTitle?: string }>} */
const PAGES = [
  {
    outFile: 'inspect.html',
    canonical: '/inspect',
    title: 'Homie Inspect — Real items, real quotes, from any inspection report',
    description: 'Upload your home inspection PDF and Homie\'s AI turns it into actionable items with real cost estimates, local provider quotes, and a Home IQ benchmark.',
    ogImage: '/og-image.png', // TODO swap to /og-inspect.png once a branded image exists
    twitterTitle: 'Homie Inspect — Real items, real quotes',
  },
];

/** Replace the value of a meta tag (or the <title>) in the source HTML. */
function swap(html, pattern, replacement) {
  if (!pattern.test(html)) {
    console.warn(`[gen-meta-pages] pattern not found: ${pattern}`);
    return html;
  }
  return html.replace(pattern, replacement);
}

async function main() {
  const source = await readFile(SRC, 'utf8');
  for (const page of PAGES) {
    const url = `${BASE_URL}${page.canonical}`;
    const ogImage = `${BASE_URL}${page.ogImage ?? '/og-image.png'}`;
    const twitterTitle = page.twitterTitle ?? page.title;

    let html = source;
    html = swap(html, /<title>[\s\S]*?<\/title>/, `<title>${page.title}</title>`);
    html = swap(html, /<meta name="description" content="[\s\S]*?" \/>/, `<meta name="description" content="${page.description}" />`);
    html = swap(html, /<link rel="canonical" href="[\s\S]*?" \/>/, `<link rel="canonical" href="${url}" />`);
    html = swap(html, /<meta property="og:url" content="[\s\S]*?" \/>/, `<meta property="og:url" content="${url}" />`);
    html = swap(html, /<meta property="og:title" content="[\s\S]*?" \/>/, `<meta property="og:title" content="${page.title}" />`);
    html = swap(html, /<meta property="og:description" content="[\s\S]*?" \/>/, `<meta property="og:description" content="${page.description}" />`);
    html = swap(html, /<meta property="og:image" content="[\s\S]*?" \/>/, `<meta property="og:image" content="${ogImage}" />`);
    html = swap(html, /<meta name="twitter:title" content="[\s\S]*?" \/>/, `<meta name="twitter:title" content="${twitterTitle}" />`);
    html = swap(html, /<meta name="twitter:description" content="[\s\S]*?" \/>/, `<meta name="twitter:description" content="${page.description}" />`);
    html = swap(html, /<meta name="twitter:image" content="[\s\S]*?" \/>/, `<meta name="twitter:image" content="${ogImage}" />`);

    const outPath = resolve(DIST, page.outFile);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, html, 'utf8');
    console.log(`[gen-meta-pages] wrote ${page.outFile} (canonical: ${page.canonical})`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
