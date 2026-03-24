import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adminService } from '@/services/admin-api';

function renderBold(text: string) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : part
  );
}

interface Job {
  id: string;
  homeownerEmail: string | null;
  diagnosis: { category?: string; severity?: string; summary?: string } | null;
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
    diagnosis: { category?: string; severity?: string; summary?: string; recommendedActions?: string[] } | null;
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
    attemptedAt: string;
    respondedAt: string | null;
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
        <table className="w-full text-sm">
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
                    <td className="px-4 py-3 text-dark/60 font-mono text-xs">{j.id.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-dark">{j.homeownerEmail ?? '-'}</td>
                    <td className="px-4 py-3 text-dark/60">
                      {j.diagnosis?.category ? j.diagnosis.category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '-'}
                      {j.workspaceId && <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 uppercase tracking-wide">Business</span>}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={j.status} /></td>
                    <td className="px-4 py-3 capitalize text-dark/60">{j.tier}</td>
                    <td className="px-4 py-3 text-dark/60">{j.zipCode}</td>
                    <td className="px-4 py-3 text-dark/60">{new Date(j.createdAt).toLocaleDateString()}</td>
                  </tr>
                  {selectedId === j.id && (
                    <tr key={`${j.id}-detail`}>
                      <td colSpan={7} className="px-0 py-0 bg-warm/30">
                        {detailLoading ? (
                          <div className="px-6 py-8 text-center text-dark/40">Loading details...</div>
                        ) : detail ? (
                          <JobDetailView detail={detail} />
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

function JobDetailView({ detail }: { detail: JobDetail }) {
  const { job, outreach_attempts, bookings } = detail;
  const [providerResponses, setProviderResponses] = useState(detail.provider_responses);
  const [showAddQuote, setShowAddQuote] = useState(false);

  // Add quote form state
  const [qName, setQName] = useState('');
  const [qPhone, setQPhone] = useState('');
  const [qEmail, setQEmail] = useState('');
  const [qPrice, setQPrice] = useState('');
  const [qAvail, setQAvail] = useState('');
  const [qMsg, setQMsg] = useState('');
  const [qSaving, setQSaving] = useState(false);
  const [qError, setQError] = useState('');

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
      }
    } catch (err: unknown) {
      setQError(err instanceof Error ? err.message : 'Failed to add quote');
    } finally {
      setQSaving(false);
    }
  }

  return (
    <div className="px-6 py-5 space-y-5">
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
      <div>
        <h3 className="text-sm font-bold text-dark mb-3">Outreach Attempts ({outreach_attempts.length})</h3>
        {outreach_attempts.length === 0 ? (
          <div className="text-sm text-dark/40">No outreach attempts</div>
        ) : (
          <div className="bg-white rounded-lg border border-dark/5 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-dark/3 border-b border-dark/5">
                  <th className="text-left px-3 py-2 font-semibold text-dark/50">Provider</th>
                  <th className="text-left px-3 py-2 font-semibold text-dark/50">Channel</th>
                  <th className="text-left px-3 py-2 font-semibold text-dark/50">Status</th>
                  <th className="text-left px-3 py-2 font-semibold text-dark/50">Contact</th>
                  <th className="text-left px-3 py-2 font-semibold text-dark/50">Sent</th>
                  <th className="text-left px-3 py-2 font-semibold text-dark/50">Responded</th>
                </tr>
              </thead>
              <tbody>
                {outreach_attempts.map(a => (
                  <tr key={a.id} className="border-b border-dark/3">
                    <td className="px-3 py-2 text-dark font-medium">{a.providerName ?? '-'}</td>
                    <td className="px-3 py-2 text-dark/60 capitalize">{a.channel}</td>
                    <td className="px-3 py-2"><StatusBadge status={a.status} /></td>
                    <td className="px-3 py-2 text-dark/50">{a.providerPhone ?? a.providerEmail ?? '-'}</td>
                    <td className="px-3 py-2 text-dark/50">{new Date(a.attemptedAt).toLocaleString()}</td>
                    <td className="px-3 py-2 text-dark/50">{a.respondedAt ? new Date(a.respondedAt).toLocaleString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                  {r.quotedPrice && <span className="text-lg font-bold text-orange-500">{r.quotedPrice}</span>}
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
              <p className="text-sm text-dark/50 mb-5">Enter the provider details and quote information.</p>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-dark/50 mb-1">Provider Name *</label>
                  <input value={qName} onChange={e => setQName(e.target.value)} placeholder="ABC Plumbing"
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
