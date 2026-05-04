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
    outFile: 'quote.html',
    canonical: '/quote',
    title: 'Get home repair quotes in minutes — Homie',
    description: 'Skip the calls. Homie\'s AI texts and calls local pros for you and brings back real quotes in minutes for plumbing, HVAC, electrical, and 16+ trades. Only charged if you get quotes.',
    twitterTitle: 'Get home repair quotes in minutes',
  },
  {
    outFile: 'chat.html',
    canonical: '/chat',
    title: 'Free AI home repair diagnostics — Homie',
    description: 'Describe your problem; Homie\'s AI diagnoses it, walks you through safe DIY fixes, or dispatches local pros for quotes. Free to use, no signup required.',
    twitterTitle: 'Free AI home repair diagnostics',
  },
  {
    outFile: 'inspect.html',
    canonical: '/inspect',
    title: 'Homie Inspect — Real items, real quotes, from any inspection report',
    description: 'Upload your home inspection PDF and Homie\'s AI turns it into actionable items with real cost estimates, local provider quotes, and a Home IQ benchmark.',
    ogImage: '/og-image.png', // TODO swap to /og-inspect.png once a branded image exists
    twitterTitle: 'Homie Inspect — Real items, real quotes',
  },
  {
    outFile: 'inspect/inspectors.html',
    canonical: '/inspect/inspectors',
    title: 'Homie Inspector Partner Program — turn every inspection into recurring revenue',
    description: 'Add the Homie AI report to every inspection. Three tiers to match each client, healthy inspector margins, free to join. You set retail — we handle delivery.',
    twitterTitle: 'Homie Inspector Partner Program',
  },
  {
    outFile: 'business/landing.html',
    canonical: '/business/landing',
    title: 'Homie Business — AI-powered maintenance for property managers and hosts',
    description: 'Dispatch AI agents to handle every maintenance call, message, and quote across your portfolio. Built for property managers, vacation rental hosts, and operators.',
    twitterTitle: 'Homie Business — AI-powered maintenance',
  },
  {
    outFile: 'support.html',
    canonical: '/support',
    title: 'Homie support center',
    description: 'Articles, guides, and AI chat for Homie, Homie Inspect, and Homie Business. Search the knowledge base or ask Homie\'s support AI for answers grounded in our help docs.',
    twitterTitle: 'Homie support center',
  },
  {
    outFile: 'support/homie.html',
    canonical: '/support/homie',
    title: 'Homie support — homeowner help center',
    description: 'Help articles for Homie homeowners — quotes, bookings, AI diagnostics, DIY analysis, and more.',
    twitterTitle: 'Homie support — homeowners',
  },
  {
    outFile: 'support/inspect.html',
    canonical: '/support/inspect',
    title: 'Homie Inspect support — inspection report help',
    description: 'Help articles for Homie Inspect — claiming reports, tier features, AI Deep Dive, repair requests, negotiation documents.',
    twitterTitle: 'Homie Inspect support',
  },
  {
    outFile: 'support/business.html',
    canonical: '/support/business',
    title: 'Homie Business support — property manager help',
    description: 'Help articles for Homie Business — workspaces, properties, dispatching, vendor scorecards, billing.',
    twitterTitle: 'Homie Business support',
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
