import { marked } from 'marked';

/**
 * Support knowledge base loader.
 *
 * Vite's `import.meta.glob` ingests every `.md` file under
 * `packages/web/content/support/**` at build time. We parse YAML
 * frontmatter inline (no extra dep) and pre-render markdown to HTML
 * with `marked`. The whole index is exported as a static array so
 * the support page + article detail + AI chat all share one shape.
 */

export type SupportProduct = 'homie' | 'inspect' | 'business';
export type SupportAudience = 'homeowner' | 'inspector' | 'pm' | 'host' | 'buyer' | 'seller';

export interface SupportArticleMeta {
  title: string;
  product: SupportProduct;
  audience: SupportAudience;
  category: string;
  tags: string[];
  order: number;
  updated: string;
}

export interface SupportArticle extends SupportArticleMeta {
  slug: string;        // e.g. "claiming-your-report"
  fullSlug: string;    // e.g. "inspect/claiming-your-report"
  body: string;        // raw markdown body (for AI chat)
  html: string;        // pre-rendered HTML (for article detail page)
  excerpt: string;     // first paragraph stripped to 200 chars
}

// ---------------------------------------------------------------------------
// Frontmatter parser — simple YAML subset (key: value, arrays via [a, b, c])
// ---------------------------------------------------------------------------

function parseFrontmatter(raw: string): { fm: Record<string, string | string[]>; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { fm: {}, body: raw };
  const fm: Record<string, string | string[]> = {};
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    if (!key) continue;
    // Strip wrapping quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    // Inline arrays: [a, b, c]
    if (value.startsWith('[') && value.endsWith(']')) {
      fm[key] = value.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } else {
      fm[key] = value;
    }
  }
  return { fm, body: match[2] };
}

function deriveSlug(filePath: string): { product: SupportProduct; slug: string; fullSlug: string } {
  // path looks like /content/support/inspect/claiming-your-report.md
  const m = filePath.match(/\/content\/support\/(homie|inspect|business)\/([^/]+)\.md$/);
  if (!m) throw new Error(`Unexpected support article path: ${filePath}`);
  const product = m[1] as SupportProduct;
  const slug = m[2];
  return { product, slug, fullSlug: `${product}/${slug}` };
}

function buildExcerpt(body: string): string {
  // First non-empty paragraph, stripped of markdown markup, truncated.
  const firstPara = body.split(/\n\n/).find((p) => p.trim() && !p.trim().startsWith('#') && !p.trim().startsWith('>'));
  if (!firstPara) return '';
  const stripped = firstPara
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\n/g, ' ')
    .trim();
  return stripped.length > 220 ? stripped.slice(0, 217) + '…' : stripped;
}

// ---------------------------------------------------------------------------
// Vite glob — eager so we have the index synchronously on first import
// ---------------------------------------------------------------------------

const RAW_FILES = import.meta.glob('/content/support/**/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

// Configure marked once for safe in-app rendering.
marked.setOptions({
  gfm: true,
  breaks: false,
});

function renderArticle(filePath: string, raw: string): SupportArticle {
  const { product, slug, fullSlug } = deriveSlug(filePath);
  const { fm, body } = parseFrontmatter(raw);

  const tags = Array.isArray(fm.tags) ? (fm.tags as string[]) : [];
  const meta: SupportArticleMeta = {
    title: typeof fm.title === 'string' ? fm.title : slug,
    product,
    audience: (typeof fm.audience === 'string' ? fm.audience : 'homeowner') as SupportAudience,
    category: typeof fm.category === 'string' ? fm.category : 'general',
    tags,
    order: typeof fm.order === 'string' ? parseInt(fm.order, 10) || 99 : 99,
    updated: typeof fm.updated === 'string' ? fm.updated : '',
  };

  return {
    ...meta,
    slug,
    fullSlug,
    body,
    html: marked.parse(body) as string,
    excerpt: buildExcerpt(body),
  };
}

// ---------------------------------------------------------------------------
// Public exports
// ---------------------------------------------------------------------------

export const SUPPORT_ARTICLES: SupportArticle[] = Object.entries(RAW_FILES)
  .map(([path, raw]) => renderArticle(path, raw))
  .sort((a, b) => {
    if (a.product !== b.product) return a.product.localeCompare(b.product);
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.order - b.order;
  });

export function findArticle(product: SupportProduct, slug: string): SupportArticle | undefined {
  return SUPPORT_ARTICLES.find((a) => a.product === product && a.slug === slug);
}

/** All distinct categories per product, in display order (first-seen wins). */
export function categoriesForProduct(product: SupportProduct): string[] {
  const seen = new Set<string>();
  for (const a of SUPPORT_ARTICLES) {
    if (a.product === product) seen.add(a.category);
  }
  return Array.from(seen);
}

/** Articles in a given product+category, in display order. */
export function articlesByCategory(product: SupportProduct, category: string): SupportArticle[] {
  return SUPPORT_ARTICLES.filter((a) => a.product === product && a.category === category);
}

/** Articles for a single product, in display order. */
export function articlesForProduct(product: SupportProduct): SupportArticle[] {
  return SUPPORT_ARTICLES.filter((a) => a.product === product);
}

/**
 * Lightweight client-side search. Match titles + tags + first paragraph.
 * Scores by exact-word matches in title (3x), tags (2x), body (1x).
 */
export function searchArticles(query: string, product?: SupportProduct): SupportArticle[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  const candidates = product ? articlesForProduct(product) : SUPPORT_ARTICLES;
  type Scored = { article: SupportArticle; score: number };
  const scored: Scored[] = [];
  for (const a of candidates) {
    const title = a.title.toLowerCase();
    const tags = a.tags.join(' ').toLowerCase();
    const body = a.body.toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (title.includes(t)) score += 3;
      if (tags.includes(t)) score += 2;
      if (body.includes(t)) score += 1;
    }
    if (score > 0) scored.push({ article: a, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 10).map((s) => s.article);
}

/** Display-friendly product label. */
export const PRODUCT_LABELS: Record<SupportProduct, string> = {
  homie: 'Homie',
  inspect: 'Homie Inspect',
  business: 'Homie Business',
};

/** Display-friendly category label per product. */
export const CATEGORY_LABELS: Record<string, string> = {
  'getting-started': 'Getting started',
  quotes: 'Quotes & bookings',
  items: 'Items & analysis',
  negotiations: 'Negotiations',
  maintenance: 'Maintenance',
  documents: 'Documents',
  troubleshooting: 'Troubleshooting',
  inspector: 'For inspectors',
  properties: 'Properties',
  vendors: 'Vendors',
  dispatches: 'Dispatches',
};
