interface PageCitationProps {
  sourcePages?: number[] | null;
  reportFileUrl?: string | null;
}

/**
 * Clickable "Page 5" link that opens the source inspection PDF at the referenced page.
 * Renders nothing if there are no page numbers or no PDF URL available.
 * Renders non-clickable text if the URL is a data URL (no page navigation possible).
 */
export default function PageCitation({ sourcePages, reportFileUrl }: PageCitationProps) {
  if (!sourcePages || sourcePages.length === 0) return null;

  // Format the label
  const pages = [...sourcePages].sort((a, b) => a - b);
  const firstPage = pages[0];
  const lastPage = pages[pages.length - 1];
  const label = pages.length === 1
    ? `Page ${firstPage}`
    : firstPage === lastPage
    ? `Page ${firstPage}`
    : pages.length === 2 && lastPage === firstPage + 1
    ? `Pages ${firstPage}-${lastPage}`
    : `Pages ${firstPage}-${lastPage}`;

  const hasUrl = !!reportFileUrl && !reportFileUrl.startsWith('data:');

  if (!hasUrl) {
    // No URL (or data URL) — show as plain non-clickable text
    return (
      <span
        title="Original PDF not available for page navigation"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 500,
          color: 'var(--bp-subtle)', padding: '2px 6px', borderRadius: 4,
          background: 'var(--bp-bg)',
        }}
      >
        <span style={{ fontSize: 10 }}>{'\uD83D\uDCC4'}</span>
        {label}
      </span>
    );
  }

  // Fragment #page=N is the standard PDF URL fragment spec (RFC 8118) — most browser PDF viewers honor it
  const href = `${reportFileUrl}#page=${firstPage}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={`Open inspection PDF at ${label.toLowerCase()}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 600,
        color: '#2563EB', padding: '2px 8px', borderRadius: 4,
        background: '#2563EB10', border: '1px solid #2563EB25',
        cursor: 'pointer', textDecoration: 'none',
      }}
      onMouseOver={e => { e.currentTarget.style.background = '#2563EB20'; }}
      onMouseOut={e => { e.currentTarget.style.background = '#2563EB10'; }}
    >
      <span style={{ fontSize: 10 }}>{'\uD83D\uDCC4'}</span>
      {label}
    </a>
  );
}
