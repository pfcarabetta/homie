import { promises as fs } from 'fs';
import path from 'path';
import logger from '../logger';

/**
 * Support knowledge base loader (server-side).
 *
 * Loads every markdown file under `packages/web/content/support/**` at
 * process startup, parses minimal YAML frontmatter, and exposes a
 * single concatenated string for the AI chat prompt + a list of
 * articles for any future endpoints (e.g. an admin browser).
 *
 * The content lives in the web package because the support-page UI
 * also bundles it (via Vite glob) — this is the same source of truth.
 * The path here resolves relative to packages/api/dist or src.
 */

export interface KBArticle {
  product: 'homie' | 'inspect' | 'business';
  slug: string;
  title: string;
  audience: string;
  category: string;
  body: string;
}

let cachedArticles: KBArticle[] | null = null;
let cachedPromptKB: string | null = null;

function resolveContentRoot(): string {
  // dev: packages/api/src/services/support-kb.ts → ../../../web/content/support
  // prod (compiled): packages/api/dist/services/support-kb.js → ../../../web/content/support
  // Either way the relative climb is the same.
  return path.resolve(__dirname, '../../../web/content/support');
}

function parseFrontmatter(raw: string): { fm: Record<string, string>; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { fm: {}, body: raw };
  const fm: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    if (!key) continue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    fm[key] = value;
  }
  return { fm, body: match[2] };
}

async function loadProduct(product: 'homie' | 'inspect' | 'business', dir: string): Promise<KBArticle[]> {
  const subDir = path.join(dir, product);
  let files: string[];
  try {
    files = await fs.readdir(subDir);
  } catch (err) {
    logger.warn({ err, subDir }, '[support-kb] Failed to read product dir');
    return [];
  }
  const articles: KBArticle[] = [];
  for (const file of files) {
    if (!file.endsWith('.md')) continue;
    const slug = file.replace(/\.md$/, '');
    try {
      const raw = await fs.readFile(path.join(subDir, file), 'utf8');
      const { fm, body } = parseFrontmatter(raw);
      articles.push({
        product,
        slug,
        title: fm.title || slug,
        audience: fm.audience || 'homeowner',
        category: fm.category || 'general',
        body,
      });
    } catch (err) {
      logger.warn({ err, file }, '[support-kb] Failed to read article');
    }
  }
  return articles;
}

/** Loads (and caches) every article. Idempotent. */
export async function loadKB(): Promise<KBArticle[]> {
  if (cachedArticles) return cachedArticles;
  const root = resolveContentRoot();
  logger.info({ root }, '[support-kb] Loading knowledge base');
  const [homie, inspect, business] = await Promise.all([
    loadProduct('homie', root),
    loadProduct('inspect', root),
    loadProduct('business', root),
  ]);
  cachedArticles = [...homie, ...inspect, ...business];
  logger.info({ count: cachedArticles.length }, '[support-kb] Knowledge base loaded');
  return cachedArticles;
}

/**
 * Returns the entire KB formatted for inclusion in a Claude system
 * prompt — wrapped in <article> tags with metadata. Cached so we only
 * build the string once. This goes inside Anthropic's prompt-caching
 * boundary so subsequent chats pay ~10% input cost on the cached portion.
 */
export async function getKnowledgeBasePrompt(): Promise<string> {
  if (cachedPromptKB) return cachedPromptKB;
  const articles = await loadKB();
  const blocks = articles.map((a) =>
    `<article slug="${a.product}/${a.slug}" product="${a.product}" audience="${a.audience}" category="${a.category}">\n# ${a.title}\n\n${a.body.trim()}\n</article>`,
  );
  cachedPromptKB = blocks.join('\n\n---\n\n');
  return cachedPromptKB;
}

/** Force a reload — useful for dev hot-reload or admin actions. */
export function clearKBCache(): void {
  cachedArticles = null;
  cachedPromptKB = null;
}
