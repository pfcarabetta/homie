import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adminService } from '@/services/admin-api';

function cleanPrice(price: string): string {
  let p = price.replace(/^\$+/, '$');
  const bm = p.match(/between\s+\$?(\d+(?:\.\d+)?)\s*(?:and|to)\s*\$?(\d+(?:\.\d+)?)/i);
  if (bm) return `$${bm[1]}-$${bm[2]}`;
  const rm = p.match(/^(\d+(?:\.\d+)?)\s*(?:to|-|–)\s*(\d+(?:\.\d+)?)$/);
  if (rm) return `$${rm[1]}-$${rm[2]}`;
  const nm = p.match(/^(\d+(?:\.\d+)?)$/);
  if (nm) return `$${nm[1]}`;
  const em = p.match(/(?:is|are|be|charge|cost|runs?|pay)\s+(?:about|around)?\s*\$?(\d+(?:\.\d+)?)/i);
  if (em) return `$${em[1]}`;
  const lp = p.match(/^\$(\d+(?:\.\d+)?)\s+\w/);
  if (lp) return `$${lp[1]}`;
  const ln = p.match(/^(\d+(?:\.\d+)?)\s+(?:service|for|per|flat|call|visit|fee|charge|total)/i);
  if (ln) return `$${ln[1]}`;
  return p;
}

function renderBold(text: string) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : part
  );
}

interface Job {
  id: string;
  homeownerEmail: string | null;
  diagnosis: { category?: string; severity?: string; summary?: string; source?: string } | null;
  tier: string;
  status: string;
  zipCode: string;
  preferredTiming: string | null;
  budget: string | null;
  workspaceId: string | null;
  createdAt: string;
}

interface JobDetail {
  job: {
    id: string;
    homeownerEmail: string | null;
    homeownerPhone: string | null;
    homeownerName: string | null;
    diagnosis: { category?: string; severity?: string; summary?: string; source?: string; recommendedActions?: string[] } | null;
    tier: string;
    status: string;
    paymentStatus: string;
    zipCode: string;
    preferredTiming: string | null;
    budget: string | null;
    createdAt: string;
    expiresAt: string | null;
  };
  outreach_attempts: Array<{
    id: string;
    channel: string;
    status: string;
    providerName: string | null;
    providerPhone: string | null;
    providerEmail: string | null;
    providerGooglePlaceId: string | null;
    providerYelpUrl: string | null;
    providerSource: 'google' | 'yelp' | 'manual';
    attemptedAt: string;
    respondedAt: string | null;
    scriptUsed: string | null;
    responseRaw: string | null;
  }>;
  provider_responses: Array<{
    id: string;
    providerName: string | null;
    providerPhone: string | null;
    channel: string;
    quotedPrice: string | null;
    availability: string | null;
    message: string | null;
    createdAt: string;
  }>;
  bookings: Array<{
    id: string;
    providerName: string | null;
    status: string;
    confirmedAt: string;
  }>;
}

const PAGE_SIZE = 25;
const STATUSES = ['all', 'open', 'dispatching', 'collecting', 'completed', 'expired', 'refunded'];

export default function AdminJobs() {
  const [searchParams] = useSearchParams();
  const [rows, setRows] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState('all');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState(searchParams.get('q') ?? '');

  useEffect(() => {
    setLoading(true);
    adminService.getJobs({ limit: PAGE_SIZE, offset, status: status === 'all' ? undefined : status, q: search || undefined })
      .then((res) => {
        setRows(res.data ?? []);
        setTotal((res.meta.total as number) ?? 0);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [offset, status, search]);

  async function selectJob(id: string) {
    if (selectedId === id) { setSelectedId(null); setDetail(null); return; }
    setSelectedId(id);
    setDetailLoading(true);
    try {
      const res = await adminService.getJobDetail(id);
      setDetail(res.data);
    } catch { setDetail(null); }
    setDetailLoading(false);
  }

  if (error) return <div className="text-red-600">{error}</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-dark">Jobs</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => { setStatus(s); setOffset(0); setSelectedId(null); }}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors capitalize ${
                status === s ? 'bg-dark text-white' : 'bg-dark/5 text-dark/50 hover:bg-dark/10'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <input value={search} onChange={e => { setSearch(e.target.value); setOffset(0); }} placeholder="Search by email, category, zip, or ID..."
        className="w-full px-4 py-2.5 mb-4 rounded-lg border border-dark/10 text-sm outline-none focus:border-orange-400 bg-white" />

      <div className="bg-white rounded-xl border border-dark/10 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[620px]">
          <thead>
            <tr className="border-b border-dark/10 bg-warm">
              <th className="text-left px-4 py-3 font-semibold text-dark/60">ID</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Homeowner</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Category</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Status</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Tier</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Zip</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Created</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-dark/40">Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-dark/40">{search ? 'No matches' : 'No jobs found'}</td></tr>
            ) : (
              rows.map((j) => (
                <>
                  <tr key={j.id} onClick={() => selectJob(j.id)} className={`border-b border-dark/5 cursor-pointer transition-colors ${selectedId === j.id ? 'bg-orange-500/5' : 'hover:bg-warm/50'}`}>
                    <td className="px-4 py-3 text-dark/60 font-mono text-xs whitespace-nowrap">{j.id.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-dark max-w-[180px] truncate">{j.homeownerEmail ?? '-'}</td>
                    <td className="px-4 py-3 text-dark/60">
                      {j.diagnosis?.category ? j.diagnosis.category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '-'}
                      {j.workspaceId && <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 uppercase tracking-wide">Business</span>}
                      {j.diagnosis?.source === 'inspection_report' && <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 uppercase tracking-wide">Inspect</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap"><StatusBadge status={j.status} /></td>
                    <td className="px-4 py-3 capitalize text-dark/60 whitespace-nowrap">{j.tier}</td>
                    <td className="px-4 py-3 text-dark/60 whitespace-nowrap">{j.zipCode}</td>
                    <td className="px-4 py-3 text-dark/60 whitespace-nowrap">{new Date(j.createdAt).toLocaleDateString()}</td>
                  </tr>
                  {selectedId === j.id && (
                    <tr key={`${j.id}-detail`}>
                      <td colSpan={7} className="px-0 py-0 bg-warm/30" style={{ maxWidth: 0 }}>
                        {detailLoading ? (
                          <div className="px-6 py-8 text-center text-dark/40">Loading details...</div>
                        ) : detail ? (
                          <JobDetailView detail={detail} onStatusChange={newStatus => {
                            setRows(prev => prev.map(r => r.id === j.id ? { ...r, status: newStatus } : r));
                          }} />
                        ) : (
                          <div className="px-6 py-8 text-center text-dark/40">Failed to load details</div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-center gap-4 mt-4">
          <button onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} disabled={offset === 0} className="text-sm font-semibold text-dark/50 hover:text-dark disabled:text-dark/20">Previous</button>
          <span className="text-sm text-dark/40">{offset + 1}-{Math.min(offset + PAGE_SIZE, total)} of {total}</span>
          <button onClick={() => setOffset(offset + PAGE_SIZE)} disabled={offset + PAGE_SIZE >= total} className="text-sm font-semibold text-dark/50 hover:text-dark disabled:text-dark/20">Next</button>
        </div>
      )}
    </div>
  );
}

function JobDetailView({ detail, onStatusChange }: { detail: JobDetail; onStatusChange?: (status: string) => void }) {
  const { job, outreach_attempts, bookings } = detail;
  const [providerResponses, setProviderResponses] = useState(detail.provider_responses);
  const [showAddQuote, setShowAddQuote] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [jobStatus, setJobStatus] = useState(job.status);

  // Add quote form state
  const [qName, setQName] = useState('');
  const [qPhone, setQPhone] = useState('');
  const [qEmail, setQEmail] = useState('');
  const [qPrice, setQPrice] = useState('');
  const [qAvail, setQAvail] = useState('');
  const [qMsg, setQMsg] = useState('');
  const [qSaving, setQSaving] = useState(false);
  const [qError, setQError] = useState('');
  const [gSearch, setGSearch] = useState('');
  const [gResults, setGResults] = useState<Array<{ placeId: string; name: string; rating: number; reviewCount: number; address: string }>>([]);
  const [gLoading, setGLoading] = useState(false);
  const [gSelected, setGSelected] = useState<{ placeId: string; name: string; rating: number; reviewCount: number; address: string } | null>(null);
  const gTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleGoogleSearch(query: string) {
    setGSearch(query);
    setGSelected(null);
    if (gTimerRef.current) clearTimeout(gTimerRef.current);
    if (query.trim().length < 2) { setGResults([]); return; }
    gTimerRef.current = setTimeout(async () => {
      setGLoading(true);
      try {
        const zip = job.zipCode || '';
        const res = await adminService.searchGoogle(query.trim(), zip);
        setGResults(res.data ?? []);
      } catch { setGResults([]); }
      setGLoading(false);
    }, 400);
  }

  async function selectGoogleResult(result: typeof gResults[number]) {
    setGSelected(result);
    setQName(result.name);
    setGSearch('');
    setGResults([]);

    // Fetch phone/website from Place Details
    try {
      const details = await adminService.getGooglePlaceDetails(result.placeId);
      if (details.data?.phone) setQPhone(details.data.phone);
      if (details.data?.website) {
        // Try to extract email from website domain (common pattern: info@domain.com)
        // Otherwise leave email blank — at least phone is filled
      }
    } catch { /* details fetch failed, no problem */ }
  }

  function clearGoogleSelection() {
    setGSelected(null);
    setQName('');
    setGSearch('');
    setGResults([]);
  }

  async function handleAddQuote() {
    if (!qName.trim()) { setQError('Provider name is required'); return; }
    setQSaving(true);
    setQError('');
    try {
      const res = await adminService.addManualQuote(job.id, {
        provider_name: qName.trim(),
        provider_phone: qPhone.trim() || undefined,
        provider_email: qEmail.trim() || undefined,
        quoted_price: qPrice.trim() ? `$${qPrice.trim().replace(/^\$/, '')}` : undefined,
        availability: qAvail.trim() || undefined,
        message: qMsg.trim() || undefined,
      });
      if (res.data) {
        setProviderResponses(prev => [...prev, {
          id: res.data!.id,
          providerName: res.data!.providerName,
          providerPhone: qPhone.trim() || null,
          channel: 'manual',
          quotedPrice: res.data!.quotedPrice,
          availability: res.data!.availability,
          message: res.data!.message,
          createdAt: new Date().toISOString(),
        }]);
        setShowAddQuote(false);
        setQName(''); setQPhone(''); setQEmail(''); setQPrice(''); setQAvail(''); setQMsg('');
        setGSearch(''); setGResults([]); setGSelected(null);
      }
    } catch (err: unknown) {
      setQError(err instanceof Error ? err.message : 'Failed to add quote');
    } finally {
      setQSaving(false);
    }
  }

  return (
    <div className="px-4 sm:px-6 py-5 space-y-5 min-w-0">
      {/* Job Info */}
      <div>
        <h3 className="text-sm font-bold text-dark mb-3">Job Details</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <InfoCard label="Job ID" value={job.id.slice(0, 8)} mono />
          <InfoCard label="Status" value={job.status} capitalize badge />
          <InfoCard label="Payment" value={job.paymentStatus} capitalize />
          <InfoCard label="Tier" value={job.tier} capitalize />
          <InfoCard label="Category" value={job.diagnosis?.category ?? '-'} capitalize />
          <InfoCard label="Severity" value={job.diagnosis?.severity ?? '-'} capitalize />
          <InfoCard label="Zip Code" value={job.zipCode} />
          <InfoCard label="Timing" value={job.preferredTiming ?? 'Flexible'} />
          <InfoCard label="Budget" value={job.budget ?? 'Not specified'} />
          <InfoCard label="Created" value={new Date(job.createdAt).toLocaleString()} />
          <InfoCard label="Expires" value={job.expiresAt ? new Date(job.expiresAt).toLocaleString() : 'N/A'} />
        </div>
        {job.diagnosis?.summary && (
          <div className="mt-3 bg-white rounded-lg border border-dark/5 p-3">
            <div className="text-xs font-semibold text-dark/40 mb-1">Diagnosis Summary</div>
            <div className="text-sm text-dark/70 leading-relaxed">{renderBold(job.diagnosis.summary)}</div>
          </div>
        )}
      </div>

      {/* Homeowner */}
      <div>
        <h3 className="text-sm font-bold text-dark mb-3">Homeowner</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <InfoCard label="Name" value={job.homeownerName ?? '-'} />
          <InfoCard label="Email" value={job.homeownerEmail ?? '-'} />
          <InfoCard label="Phone" value={job.homeownerPhone ?? '-'} />
        </div>
      </div>

      {/* Outreach Attempts */}
      <div className="overflow-hidden">
        <h3 className="text-sm font-bold text-dark mb-3">Outreach Attempts ({outreach_attempts.length})</h3>
        {outreach_attempts.length === 0 ? (
          <div className="text-sm text-dark/40">No outreach attempts</div>
        ) : (
          <div className="space-y-2">
            {outreach_attempts.map(a => {
              const hasTranscript = !!(a.responseRaw || a.scriptUsed);
              const isVoiceTranscript = a.channel === 'voice' && a.responseRaw;
              let transcript: { role: string; content: string }[] | null = null;
              if (isVoiceTranscript) {
                try { transcript = JSON.parse(a.responseRaw!); } catch { /* not JSON */ }
              }

              return (
                <details key={a.id} className="bg-white rounded-lg border border-dark/5 group" style={{ overflow: 'hidden', maxWidth: '100%' }}>
                  <summary className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-dark/2 transition-colors text-xs select-none">
                    <SourceIcon source={a.providerSource} googlePlaceId={a.providerGooglePlaceId} yelpUrl={a.providerYelpUrl} />
                    <span className="text-dark font-semibold flex-1 min-w-0 truncate">{a.providerName ?? '-'}</span>
                    <span className="capitalize text-dark/50 w-12 shrink-0">{a.channel}</span>
                    <span className="w-20 shrink-0"><StatusBadge status={a.status} /></span>
                    <span className="text-dark/40 w-16 shrink-0 text-right">{new Date(a.attemptedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    <span className="text-dark/30 text-[10px] shrink-0">{hasTranscript ? '▼' : ''}</span>
                  </summary>

                  {hasTranscript && (
                    <div className="border-t border-dark/5 px-3 py-3 bg-dark/1" style={{ overflow: 'hidden', maxWidth: '100%', boxSizing: 'border-box' }}>
                      {/* Contact info */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-dark/40 mb-3">
                        {a.providerPhone && <span>📞 {a.providerPhone}</span>}
                        {a.providerEmail && <span className="truncate max-w-[200px]">✉ {a.providerEmail}</span>}
                        <span>Sent: {new Date(a.attemptedAt).toLocaleString()}</span>
                        {a.respondedAt && <span>Responded: {new Date(a.respondedAt).toLocaleString()}</span>}
                      </div>

                      {/* Voice transcript — conversation format */}
                      {transcript && (
                        <div className="space-y-2 mb-3">
                          <div className="text-[10px] font-bold text-dark/30 uppercase tracking-wider">Voice Transcript</div>
                          {transcript.map((msg, i) => (
                            <div key={i} className={`flex gap-2 min-w-0 ${msg.role === 'assistant' ? '' : 'justify-end'}`}>
                              {msg.role === 'assistant' && <div className="text-[10px] font-bold shrink-0 mt-1 text-orange-500">HOMIE</div>}
                              <div className={`text-xs leading-relaxed rounded-lg px-3 py-2 break-words ${
                                msg.role === 'assistant'
                                  ? 'bg-orange-50 text-dark/70 border border-orange-100'
                                  : 'bg-emerald-50 text-dark/70 border border-emerald-100'
                              }`} style={{ maxWidth: 'min(80%, 500px)' }}>
                                {msg.content}
                              </div>
                              {msg.role !== 'assistant' && <div className="text-[10px] font-bold shrink-0 mt-1 text-emerald-600">PROVIDER</div>}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* SMS transcript */}
                      {a.channel === 'sms' && a.responseRaw && !transcript && (() => {
                        let smsMessages: { role: string; content: string }[] | null = null;
                        try {
                          const parsed = JSON.parse(a.responseRaw!);
                          if (Array.isArray(parsed) && parsed[0]?.role) smsMessages = parsed;
                        } catch { /* not JSON */ }

                        if (smsMessages) {
                          return (
                            <div className="space-y-2 mb-3">
                              <div className="text-[10px] font-bold text-dark/30 uppercase tracking-wider">SMS Conversation</div>
                              {smsMessages.map((msg, i) => (
                                <div key={i} className={`flex gap-2 ${msg.role === 'assistant' ? '' : 'flex-row-reverse'}`}>
                                  <div className={`text-[10px] font-bold shrink-0 mt-1 ${msg.role === 'assistant' ? 'text-orange-500' : 'text-emerald-600'}`}>
                                    {msg.role === 'assistant' ? 'HOMIE' : 'PROVIDER'}
                                  </div>
                                  <div className={`text-xs leading-relaxed rounded-lg px-3 py-2 max-w-[80%] ${
                                    msg.role === 'assistant'
                                      ? 'bg-orange-50 text-dark/70 border border-orange-100'
                                      : 'bg-emerald-50 text-dark/70 border border-emerald-100'
                                  }`}>
                                    {msg.content}
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        }

                        return (
                          <div className="mb-3">
                            <div className="text-[10px] font-bold text-dark/30 uppercase tracking-wider mb-1">SMS Reply</div>
                            <div className="text-xs text-dark/70 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                              {a.responseRaw}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Web outreach — error or status */}
                      {a.channel === 'web' && a.responseRaw && (
                        <div className="mb-3">
                          <div className="text-[10px] font-bold text-dark/30 uppercase tracking-wider mb-1">Web Outreach Result</div>
                          <div className="text-xs text-dark/50 bg-dark/3 rounded-lg px-3 py-2">{a.responseRaw}</div>
                        </div>
                      )}

                      {/* Outreach script */}
                      {a.scriptUsed && (
                        <details className="mt-2">
                          <summary className="text-[10px] font-semibold text-dark/30 cursor-pointer hover:text-dark/50">View outreach script</summary>
                          <div className="text-xs text-dark/50 bg-dark/3 rounded-lg px-3 py-2 mt-1 leading-relaxed whitespace-pre-wrap break-words overflow-hidden">
                            {a.scriptUsed}
                          </div>
                        </details>
                      )}
                    </div>
                  )}
                </details>
              );
            })}
          </div>
        )}
      </div>

      {/* Provider Responses */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-bold text-dark">Provider Quotes ({providerResponses.length})</h3>
          <button onClick={() => setShowAddQuote(true)} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors">+ Add Quote</button>
        </div>
        {providerResponses.length === 0 ? (
          <div className="text-sm text-dark/40">No quotes received</div>
        ) : (
          <div className="space-y-2">
            {providerResponses.map(r => (
              <div key={r.id} className="bg-white rounded-lg border border-dark/5 p-3">
                <div className="flex justify-between items-center mb-2">
                  <div>
                    <span className="text-sm font-semibold text-dark">{r.providerName ?? 'Unknown'}</span>
                    {r.providerPhone && <span className="text-xs text-dark/40 ml-2">{r.providerPhone}</span>}
                    {r.channel === 'manual' && <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 uppercase">Manual</span>}
                  </div>
                  {r.quotedPrice && <span className="text-lg font-bold text-orange-500">{cleanPrice(r.quotedPrice)}</span>}
                </div>
                <div className="flex gap-4 text-xs text-dark/50">
                  {r.availability && <span>Avail: {r.availability}</span>}
                  <span>via {r.channel}</span>
                  <span>{new Date(r.createdAt).toLocaleString()}</span>
                </div>
                {r.message && <div className="mt-2 text-sm text-dark/60 italic">"{r.message}"</div>}
              </div>
            ))}
          </div>
        )}

        {/* Add Quote Modal */}
        {showAddQuote && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAddQuote(false)}>
            <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-dark mb-1">Add Manual Quote</h3>
              <p className="text-sm text-dark/50 mb-5">Search Google for a business or enter details manually.</p>

              <div className="space-y-3">
                {/* Google Business Search */}
                {!gSelected && (
                  <div className="relative">
                    <label className="block text-xs font-semibold text-dark/50 mb-1">Search Google Business</label>
                    <div className="relative">
                      <input value={gSearch} onChange={e => handleGoogleSearch(e.target.value)} placeholder="Search for a business..."
                        className="w-full px-3 py-2 rounded-lg border border-dark/10 text-sm outline-none focus:border-orange-400 pr-8" />
                      {gLoading && <div className="absolute right-3 top-2.5 text-dark/30 text-xs">...</div>}
                    </div>
                    {gResults.length > 0 && (
                      <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-dark/10 rounded-lg shadow-lg max-h-48 overflow-auto">
                        {gResults.map(r => (
                          <button key={r.placeId} onClick={() => selectGoogleResult(r)}
                            className="w-full text-left px-3 py-2.5 hover:bg-orange-50 transition-colors border-b border-dark/5 last:border-0">
                            <div className="text-sm font-semibold text-dark">{r.name}</div>
                            <div className="text-xs text-dark/40 flex gap-2 mt-0.5">
                              <span>★ {r.rating}</span>
                              <span>{r.reviewCount} reviews</span>
                              <span className="truncate">{r.address}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Selected Google Business */}
                {gSelected && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex justify-between items-start">
                    <div>
                      <div className="text-sm font-bold text-dark">{gSelected.name}</div>
                      <div className="text-xs text-dark/50 mt-0.5">★ {gSelected.rating} · {gSelected.reviewCount} reviews</div>
                      <div className="text-xs text-dark/40 mt-0.5">{gSelected.address}</div>
                    </div>
                    <button onClick={clearGoogleSelection} className="text-dark/30 hover:text-dark/60 text-sm ml-2 flex-shrink-0">✕</button>
                  </div>
                )}

                {/* Divider with "or" */}
                {!gSelected && (
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-dark/10" />
                    <span className="text-xs text-dark/30 font-semibold">OR ENTER MANUALLY</span>
                    <div className="flex-1 h-px bg-dark/10" />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-dark/50 mb-1">Provider Name {!gSelected && '*'}</label>
                  <input value={qName} onChange={e => { setQName(e.target.value); if (gSelected) setGSelected(null); }} placeholder="ABC Plumbing"
                    className="w-full px-3 py-2 rounded-lg border border-dark/10 text-sm outline-none focus:border-orange-400" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-dark/50 mb-1">Phone</label>
                    <input value={qPhone} onChange={e => setQPhone(e.target.value)} placeholder="(555) 123-4567"
                      className="w-full px-3 py-2 rounded-lg border border-dark/10 text-sm outline-none focus:border-orange-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-dark/50 mb-1">Email</label>
                    <input value={qEmail} onChange={e => setQEmail(e.target.value)} placeholder="pro@email.com" type="email"
                      className="w-full px-3 py-2 rounded-lg border border-dark/10 text-sm outline-none focus:border-orange-400" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-dark/50 mb-1">Quoted Price — Estimate</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-dark/40 text-sm">$</span>
                      <input value={qPrice} onChange={e => setQPrice(e.target.value.replace(/[^0-9.,\-]/g, ''))} placeholder="185" inputMode="decimal"
                        className="w-full pl-7 pr-3 py-2 rounded-lg border border-dark/10 text-sm outline-none focus:border-orange-400" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-dark/50 mb-1">Availability</label>
                    <input value={qAvail} onChange={e => setQAvail(e.target.value)} placeholder="Tomorrow 9-11 AM"
                      className="w-full px-3 py-2 rounded-lg border border-dark/10 text-sm outline-none focus:border-orange-400" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-dark/50 mb-1">Message / Notes</label>
                  <textarea value={qMsg} onChange={e => setQMsg(e.target.value)} rows={2} placeholder="Any notes from the provider..."
                    className="w-full px-3 py-2 rounded-lg border border-dark/10 text-sm outline-none focus:border-orange-400 resize-none" />
                </div>
              </div>

              {qError && <div className="text-red-600 text-sm mt-3">{qError}</div>}

              <div className="flex gap-3 mt-5">
                <button onClick={() => setShowAddQuote(false)}
                  className="flex-1 py-2.5 rounded-lg border border-dark/10 text-sm font-semibold text-dark hover:bg-dark/5 transition-colors">Cancel</button>
                <button onClick={handleAddQuote} disabled={qSaving}
                  className="flex-1 py-2.5 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-50 transition-colors">
                  {qSaving ? 'Adding...' : 'Add Quote'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bookings */}
      {bookings.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-dark mb-3">Bookings ({bookings.length})</h3>
          <div className="space-y-2">
            {bookings.map(b => (
              <div key={b.id} className="bg-green-500/5 rounded-lg border border-green-500/10 p-3 flex justify-between items-center">
                <div>
                  <span className="text-sm font-semibold text-dark">{b.providerName ?? 'Unknown'}</span>
                  <StatusBadge status={b.status} />
                </div>
                <span className="text-xs text-dark/50">{new Date(b.confirmedAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cancel Job */}
      {!['expired', 'refunded'].includes(jobStatus) && (
        <div className="border-t border-dark/5 pt-4">
          <button onClick={async () => {
            if (!confirm('Are you sure you want to cancel this job? This will force it into expired status.')) return;
            setCancelling(true);
            try {
              await adminService.cancelJob(job.id);
              setJobStatus('expired');
              onStatusChange?.('expired');
            } catch (err) {
              alert((err as Error).message || 'Failed to cancel');
            }
            setCancelling(false);
          }} disabled={cancelling}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 disabled:opacity-50 transition-colors">
            {cancelling ? 'Cancelling...' : 'Cancel Job'}
          </button>
        </div>
      )}
      {jobStatus === 'expired' && job.status !== 'expired' && (
        <div className="text-sm text-red-600 font-medium mt-2">Job has been cancelled.</div>
      )}
    </div>
  );
}

function InfoCard({ label, value, mono, capitalize, badge }: { label: string; value: string; mono?: boolean; capitalize?: boolean; badge?: boolean }) {
  return (
    <div className="bg-white rounded-lg border border-dark/5 px-3 py-2">
      <div className="text-[10px] font-semibold text-dark/40 uppercase tracking-wide">{label}</div>
      <div className={`text-sm font-medium text-dark mt-0.5 ${mono ? 'font-mono' : ''} ${capitalize ? 'capitalize' : ''}`}>
        {badge ? <StatusBadge status={value} /> : value}
      </div>
    </div>
  );
}

/** Tiny icon showing where the provider was discovered. Click opens the source directory entry. */
function SourceIcon({ source, googlePlaceId, yelpUrl }: {
  source: 'google' | 'yelp' | 'manual';
  googlePlaceId: string | null;
  yelpUrl: string | null;
}) {
  const meta = {
    google: {
      label: 'Google',
      bg: 'bg-blue-50',
      text: 'text-blue-600',
      href: googlePlaceId ? `https://www.google.com/maps/place/?q=place_id:${googlePlaceId}` : null,
      glyph: 'G',
    },
    yelp: {
      label: 'Yelp',
      bg: 'bg-red-50',
      text: 'text-red-600',
      href: yelpUrl,
      glyph: 'Y',
    },
    manual: {
      label: 'Manually added',
      bg: 'bg-dark/5',
      text: 'text-dark/40',
      href: null,
      glyph: 'M',
    },
  }[source];
  const className = `w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold shrink-0 ${meta.bg} ${meta.text}`;
  if (meta.href) {
    return (
      <a href={meta.href} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
        title={`Discovered via ${meta.label} — click to open`} className={`${className} hover:opacity-80`}>
        {meta.glyph}
      </a>
    );
  }
  return <span title={meta.label} className={className}>{meta.glyph}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    open: 'bg-blue-100 text-blue-700',
    dispatching: 'bg-amber-100 text-amber-700',
    collecting: 'bg-purple-100 text-purple-700',
    completed: 'bg-green-100 text-green-700',
    expired: 'bg-dark/10 text-dark/50',
    refunded: 'bg-red-100 text-red-700',
    accepted: 'bg-green-100 text-green-700',
    declined: 'bg-red-100 text-red-700',
    pending: 'bg-amber-100 text-amber-700',
    failed: 'bg-red-100 text-red-700',
    no_answer: 'bg-dark/10 text-dark/50',
    confirmed: 'bg-green-100 text-green-700',
    authorized: 'bg-blue-100 text-blue-700',
    paid: 'bg-green-100 text-green-700',
    unpaid: 'bg-dark/10 text-dark/50',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold capitalize ${colors[status] ?? 'bg-dark/5 text-dark/50'}`}>
      {status}
    </span>
  );
}
