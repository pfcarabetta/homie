import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import SEO from '@/components/SEO';
import {
  SUPPORT_ARTICLES,
  articlesForProduct,
  categoriesForProduct,
  articlesByCategory,
  findArticle,
  searchArticles,
  PRODUCT_LABELS,
  CATEGORY_LABELS,
  type SupportArticle,
  type SupportProduct,
} from '@/content/support-articles';
import SupportChatWidget from '@/components/SupportChatWidget';

const ORANGE = '#E8632B';
const DARK = '#2D2926';
const WARM = '#F9F5F2';
const LINE = '#E9E3DD';
const MUTED = '#6B6560';

const PRODUCT_ACCENT: Record<SupportProduct, string> = {
  homie: '#E8632B',
  inspect: '#2563EB',
  business: '#1B9E77',
};

/**
 * Public knowledge base + AI chat + contact form. One route handles three
 * states via :product/:slug? params:
 *   /support                    → product picker + featured articles per product
 *   /support/:product           → category grid for the picked product
 *   /support/:product/:slug     → article detail
 */
export default function SupportPage() {
  const { product: productParam, slug } = useParams<{ product?: string; slug?: string }>();
  const navigate = useNavigate();
  const product = (productParam && ['homie', 'inspect', 'business'].includes(productParam)
    ? (productParam as SupportProduct)
    : null);
  const article = product && slug ? findArticle(product, slug) : undefined;

  // Search state
  const [query, setQuery] = useState('');
  const searchResults = useMemo(
    () => (query.trim() ? searchArticles(query, product ?? undefined) : []),
    [query, product],
  );

  // Contact form state
  const [contactOpen, setContactOpen] = useState(false);

  return (
    <div style={{ minHeight: '100vh', background: WARM, fontFamily: "'DM Sans', sans-serif" }}>
      <SEO
        title={article ? `${article.title} — Homie Support` : 'Homie Support'}
        description={article?.excerpt ?? "Help articles for Homie, Homie Inspect, and Homie Business. Plus an AI assistant and direct contact for anything we haven't covered."}
        canonical={article ? `/support/${article.fullSlug}` : product ? `/support/${product}` : '/support'}
      />

      <SupportNav onContactClick={() => setContactOpen(true)} />

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 20px 80px' }}>
        {!product ? (
          <SupportLanding query={query} setQuery={setQuery} searchResults={searchResults} onPickResult={(a) => navigate(`/support/${a.fullSlug}`)} />
        ) : article ? (
          <SupportArticleView article={article} onBack={() => navigate(`/support/${product}`)} />
        ) : (
          <SupportProductView product={product} query={query} setQuery={setQuery} searchResults={searchResults} onPickResult={(a) => navigate(`/support/${a.fullSlug}`)} />
        )}
      </div>

      {contactOpen && <ContactModal onClose={() => setContactOpen(false)} defaultProduct={product ?? undefined} />}
      <SupportChatWidget context={{ surface: 'support', product: product ?? undefined }} />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Sub-components
// ───────────────────────────────────────────────────────────────────────────

function SupportNav({ onContactClick }: { onContactClick: () => void }) {
  const navigate = useNavigate();
  return (
    <nav style={{ background: '#fff', borderBottom: `1px solid ${LINE}`, padding: '14px 20px', position: 'sticky', top: 0, zIndex: 30 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <button onClick={() => navigate('/')} style={{
          display: 'inline-flex', alignItems: 'baseline', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        }}>
          <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 24, color: ORANGE }}>homie</span>
          <span style={{ fontSize: 13, color: MUTED, fontWeight: 500 }}>support</span>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={() => navigate('/support')} style={navLinkBtn}>All articles</button>
          <button onClick={onContactClick} style={primaryBtn}>Contact us</button>
        </div>
      </div>
    </nav>
  );
}

const navLinkBtn: React.CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 500,
  color: DARK, background: 'none', border: 'none', cursor: 'pointer', padding: 4,
};
const primaryBtn: React.CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600,
  color: '#fff', background: ORANGE, border: 'none', borderRadius: 100,
  padding: '8px 18px', cursor: 'pointer',
};

function SupportLanding({ query, setQuery, searchResults, onPickResult }: {
  query: string;
  setQuery: (v: string) => void;
  searchResults: SupportArticle[];
  onPickResult: (a: SupportArticle) => void;
}) {
  const navigate = useNavigate();
  return (
    <>
      <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 36, fontWeight: 700, color: DARK, margin: 0, letterSpacing: '-0.02em' }}>
        How can we help?
      </h1>
      <p style={{ fontSize: 15, color: MUTED, marginTop: 8 }}>
        Pick a product, or search across everything. Still stuck? Hit the chat in the bottom-right or send us a note.
      </p>

      <SearchBox query={query} setQuery={setQuery} placeholder="Search across all products…" />
      {query && <SearchResults results={searchResults} onPick={onPickResult} />}

      {!query && (
        <div style={{ marginTop: 32, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          {(['homie', 'inspect', 'business'] as const).map((p) => (
            <ProductCard key={p} product={p} onOpen={() => navigate(`/support/${p}`)} />
          ))}
        </div>
      )}
    </>
  );
}

function ProductCard({ product, onOpen }: { product: SupportProduct; onOpen: () => void }) {
  const accent = PRODUCT_ACCENT[product];
  const articles = articlesForProduct(product);
  const featured = articles.slice(0, 4);
  return (
    <button onClick={onOpen} style={{
      background: '#fff', borderRadius: 18, border: `1px solid ${LINE}`, padding: 24,
      cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.15s, transform 0.15s',
      fontFamily: "'DM Sans', sans-serif",
    }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = LINE; e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      <div style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 100, background: `${accent}15`, color: accent, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 12 }}>
        {PRODUCT_LABELS[product]}
      </div>
      <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 700, color: DARK, margin: '0 0 14px' }}>
        {productHeadline(product)}
      </h2>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {featured.map((a) => (
          <li key={a.fullSlug} style={{ fontSize: 14, color: DARK, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: accent, fontSize: 12 }}>→</span> {a.title}
          </li>
        ))}
      </ul>
      <div style={{ marginTop: 14, fontSize: 13, color: accent, fontWeight: 600 }}>
        See all {articles.length} articles →
      </div>
    </button>
  );
}

function productHeadline(p: SupportProduct): string {
  if (p === 'homie') return 'Get quotes from local pros';
  if (p === 'inspect') return 'Make sense of your inspection';
  return 'Manage properties at scale';
}

function SupportProductView({ product, query, setQuery, searchResults, onPickResult }: {
  product: SupportProduct;
  query: string;
  setQuery: (v: string) => void;
  searchResults: SupportArticle[];
  onPickResult: (a: SupportArticle) => void;
}) {
  const navigate = useNavigate();
  const accent = PRODUCT_ACCENT[product];
  const categories = categoriesForProduct(product);
  return (
    <>
      <button onClick={() => navigate('/support')} style={{
        fontSize: 13, color: MUTED, background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 14,
      }}>
        ← All products
      </button>
      <div style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 100, background: `${accent}15`, color: accent, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 10 }}>
        {PRODUCT_LABELS[product]}
      </div>
      <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 32, fontWeight: 700, color: DARK, margin: 0 }}>
        Help & how-tos
      </h1>

      <SearchBox query={query} setQuery={setQuery} placeholder={`Search ${PRODUCT_LABELS[product]} articles…`} />
      {query && <SearchResults results={searchResults} onPick={onPickResult} />}

      {!query && (
        <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 28 }}>
          {categories.map((cat) => (
            <div key={cat}>
              <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 700, color: DARK, margin: '0 0 10px' }}>
                {CATEGORY_LABELS[cat] ?? cat}
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                {articlesByCategory(product, cat).map((a) => (
                  <ArticleCard key={a.fullSlug} article={a} accent={accent} onOpen={() => navigate(`/support/${a.fullSlug}`)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function ArticleCard({ article, accent, onOpen }: { article: SupportArticle; accent: string; onOpen: () => void }) {
  return (
    <button onClick={onOpen} style={{
      background: '#fff', borderRadius: 14, border: `1px solid ${LINE}`, padding: 16,
      cursor: 'pointer', textAlign: 'left', fontFamily: "'DM Sans', sans-serif",
      transition: 'border-color 0.15s',
    }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = accent; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = LINE; }}
    >
      <div style={{ fontSize: 15, fontWeight: 600, color: DARK, marginBottom: 4 }}>{article.title}</div>
      <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.5 }}>{article.excerpt}</div>
    </button>
  );
}

function SupportArticleView({ article, onBack }: { article: SupportArticle; onBack: () => void }) {
  const accent = PRODUCT_ACCENT[article.product];
  return (
    <>
      <button onClick={onBack} style={{
        fontSize: 13, color: MUTED, background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 14,
      }}>
        ← {PRODUCT_LABELS[article.product]} articles
      </button>
      <div style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 100, background: `${accent}15`, color: accent, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 12 }}>
        {PRODUCT_LABELS[article.product]} · {CATEGORY_LABELS[article.category] ?? article.category}
      </div>
      <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 34, fontWeight: 700, color: DARK, margin: 0, letterSpacing: '-0.01em' }}>
        {article.title}
      </h1>
      {article.updated && (
        <div style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>
          Last updated {article.updated}
        </div>
      )}
      <article
        className="hi-article-body"
        style={{ marginTop: 24, color: DARK, fontSize: 15.5, lineHeight: 1.65 }}
        dangerouslySetInnerHTML={{ __html: article.html }}
      />

      <style>{`
        .hi-article-body h2 { font-family: 'Fraunces', serif; font-size: 22px; font-weight: 700; color: ${DARK}; margin: 32px 0 12px; letter-spacing: -0.005em; }
        .hi-article-body h3 { font-family: 'DM Sans', sans-serif; font-size: 16px; font-weight: 700; color: ${DARK}; margin: 20px 0 8px; }
        .hi-article-body p { margin: 0 0 14px; }
        .hi-article-body ul, .hi-article-body ol { margin: 0 0 14px; padding-left: 22px; }
        .hi-article-body li { margin-bottom: 6px; }
        .hi-article-body strong { font-weight: 700; color: ${DARK}; }
        .hi-article-body em { font-style: italic; }
        .hi-article-body code { background: ${WARM}; padding: 1px 6px; border-radius: 4px; font-size: 0.92em; font-family: 'DM Mono', monospace; }
        .hi-article-body blockquote { border-left: 3px solid ${accent}; background: ${accent}08; padding: 10px 16px; margin: 14px 0; border-radius: 0 8px 8px 0; color: ${MUTED}; }
        .hi-article-body blockquote p:last-child { margin-bottom: 0; }
        .hi-article-body a { color: ${accent}; text-decoration: underline; }
        .hi-article-body table { border-collapse: collapse; margin: 14px 0; font-size: 14px; width: 100%; }
        .hi-article-body th, .hi-article-body td { border: 1px solid ${LINE}; padding: 8px 12px; text-align: left; }
        .hi-article-body th { background: ${WARM}; font-weight: 700; }
        .hi-article-body hr { border: 0; border-top: 1px solid ${LINE}; margin: 28px 0; }
      `}</style>
    </>
  );
}

function SearchBox({ query, setQuery, placeholder }: { query: string; setQuery: (v: string) => void; placeholder: string }) {
  return (
    <div style={{ marginTop: 24, position: 'relative' }}>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '14px 18px 14px 44px', fontSize: 15,
          background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12,
          outline: 'none', fontFamily: "'DM Sans', sans-serif", color: DARK,
          boxSizing: 'border-box',
        }}
      />
      <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: MUTED }}>🔍</span>
    </div>
  );
}

function SearchResults({ results, onPick }: { results: SupportArticle[]; onPick: (a: SupportArticle) => void }) {
  if (results.length === 0) {
    return (
      <div style={{ marginTop: 16, padding: 16, textAlign: 'center', color: MUTED, fontSize: 14 }}>
        No matches — try a different search or hit the chat for help.
      </div>
    );
  }
  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {results.map((a) => (
        <button key={a.fullSlug} onClick={() => onPick(a)} style={{
          background: '#fff', borderRadius: 12, border: `1px solid ${LINE}`, padding: '12px 16px',
          cursor: 'pointer', textAlign: 'left', fontFamily: "'DM Sans', sans-serif",
        }}>
          <div style={{ fontSize: 11, color: MUTED, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>
            {PRODUCT_LABELS[a.product]}
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: DARK, marginBottom: 3 }}>{a.title}</div>
          <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.45 }}>{a.excerpt}</div>
        </button>
      ))}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Contact modal
// ───────────────────────────────────────────────────────────────────────────

function ContactModal({ onClose, defaultProduct }: { onClose: () => void; defaultProduct?: SupportProduct }) {
  const [product, setProduct] = useState<SupportProduct>(defaultProduct ?? 'homie');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<'success' | string | null>(null);

  async function handleSubmit() {
    if (!email.trim() || !subject.trim() || !message.trim()) {
      setResult('Please fill in email, subject, and message.');
      return;
    }
    setSubmitting(true);
    setResult(null);
    try {
      const apiBase = (import.meta.env.VITE_API_URL ?? 'http://localhost:3001') as string;
      const res = await fetch(`${apiBase}/api/v1/support/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product, name: name.trim(), email: email.trim(), subject: subject.trim(), message: message.trim(),
          current_url: typeof window !== 'undefined' ? window.location.href : null,
        }),
      });
      const body = await res.json();
      if (!res.ok || body?.error) {
        setResult(body?.error || 'Something went wrong. Try again or email yo@homiepro.ai.');
      } else {
        setResult('success');
      }
    } catch (err) {
      setResult((err as Error).message || 'Network error. Try again.');
    }
    setSubmitting(false);
  }

  return (
    <div onClick={() => !submitting && onClose()} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 16, padding: '28px 28px 24px',
        maxWidth: 480, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        fontFamily: "'DM Sans', sans-serif",
      }}>
        {result === 'success' ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📨</div>
            <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 700, color: DARK, margin: '0 0 8px' }}>
              Message sent
            </h3>
            <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.55, margin: '0 0 20px' }}>
              We typically reply within a business day. We've sent a copy to your inbox so you can reply if anything's missing.
            </p>
            <button onClick={onClose} style={primaryBtn}>Done</button>
          </div>
        ) : (
          <>
            <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 700, color: DARK, margin: '0 0 6px' }}>
              Contact Homie support
            </h3>
            <p style={{ fontSize: 13, color: MUTED, margin: '0 0 18px' }}>
              We read every message. Goes straight to the team at yo@homiepro.ai.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field label="Product">
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['homie', 'inspect', 'business'] as const).map((p) => (
                    <button key={p} onClick={() => setProduct(p)} style={{
                      flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                      border: `1px solid ${product === p ? PRODUCT_ACCENT[p] : LINE}`,
                      background: product === p ? `${PRODUCT_ACCENT[p]}10` : '#fff',
                      color: product === p ? PRODUCT_ACCENT[p] : DARK,
                      cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                    }}>
                      {PRODUCT_LABELS[p]}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Your name (optional)">
                <Input value={name} onChange={setName} placeholder="Jane Doe" />
              </Field>
              <Field label="Your email" required>
                <Input value={email} onChange={setEmail} placeholder="you@example.com" type="email" />
              </Field>
              <Field label="Subject" required>
                <Input value={subject} onChange={setSubject} placeholder="What's up?" />
              </Field>
              <Field label="Message" required>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tell us what's going on. The more detail, the faster we can help."
                  style={{
                    width: '100%', padding: '10px 14px', fontSize: 14,
                    border: `1px solid ${LINE}`, borderRadius: 10, outline: 'none',
                    fontFamily: "'DM Sans', sans-serif", color: DARK, background: '#fff',
                    boxSizing: 'border-box', resize: 'vertical', minHeight: 120,
                  }}
                />
              </Field>
            </div>

            {result && result !== 'success' && (
              <div style={{ marginTop: 12, fontSize: 13, color: '#DC2626' }}>{result}</div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <button onClick={onClose} disabled={submitting} style={{
                padding: '9px 18px', borderRadius: 8, border: `1px solid ${LINE}`,
                background: '#fff', color: DARK, fontSize: 14, fontWeight: 600,
                cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans', sans-serif",
              }}>Cancel</button>
              <button onClick={handleSubmit} disabled={submitting} style={{
                padding: '9px 18px', borderRadius: 8, border: 'none',
                background: ORANGE, color: '#fff', fontSize: 14, fontWeight: 600,
                cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans', sans-serif",
                opacity: submitting ? 0.7 : 1,
              }}>{submitting ? 'Sending…' : 'Send'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 5 }}>
        {label}{required && <span style={{ color: '#DC2626' }}> *</span>}
      </span>
      {children}
    </label>
  );
}

function Input({ value, onChange, placeholder, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%', padding: '10px 14px', fontSize: 14,
        border: `1px solid ${LINE}`, borderRadius: 10, outline: 'none',
        fontFamily: "'DM Sans', sans-serif", color: DARK, background: '#fff',
        boxSizing: 'border-box',
      }}
    />
  );
}
