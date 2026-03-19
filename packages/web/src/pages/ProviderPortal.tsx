import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import {
  MOCK_PROVIDER_NAME,
  MOCK_STATS,
  MOCK_JOBS,
  type PortalJob,
  type JobTab,
  type Severity,
  type ProviderStats,
} from '@/mocks/provider-portal';

// ── Main page ───────────────────────────────────────────────────────────────

export default function ProviderPortal() {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const selectedJob = MOCK_JOBS.find((j) => j.id === selectedJobId) ?? null;

  if (selectedJob) {
    return <JobDetail job={selectedJob} onBack={() => setSelectedJobId(null)} />;
  }

  return <Dashboard onSelectJob={setSelectedJobId} />;
}

// ── Dashboard ───────────────────────────────────────────────────────────────

function Dashboard({ onSelectJob }: { onSelectJob: (id: string) => void }) {
  useDocumentTitle('Provider Dashboard');
  const [tab, setTab] = useState<JobTab>('new');
  const filtered = MOCK_JOBS.filter((j) => j.status === tab);
  const newCount = MOCK_JOBS.filter((j) => j.status === 'new').length;

  return (
    <div className="min-h-screen bg-warm">
      <PortalHeader />

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <StatsRow stats={MOCK_STATS} />

        {/* Tabs */}
        <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm border border-dark/10">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`relative flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${
                tab === t.value
                  ? 'bg-dark text-white shadow-sm'
                  : 'text-dark/50 hover:text-dark/70'
              }`}
            >
              {t.label}
              {t.value === 'new' && newCount > 0 && (
                <span className="absolute -top-1.5 -right-1 bg-orange-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                  {newCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Job grid */}
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-dark/30 text-sm">No {tab} jobs right now.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((job) => (
              <JobCard key={job.id} job={job} onClick={() => onSelectJob(job.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const TABS: { value: JobTab; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'completed', label: 'Completed' },
];

// ── Portal Header ───────────────────────────────────────────────────────────

function PortalHeader() {
  return (
    <header className="sticky top-0 z-50 bg-dark">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <Link to="/portal" className="font-display font-bold text-2xl text-orange-500">
            homie
          </Link>
          <span className="text-white/40 text-sm font-semibold">PRO</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-white/70 text-sm hidden sm:inline">{MOCK_PROVIDER_NAME}</span>
          <div className="w-9 h-9 rounded-full bg-orange-500/20 text-orange-500 flex items-center justify-center text-sm font-bold">
            R
          </div>
        </div>
      </div>
    </header>
  );
}

// ── Stats Row ───────────────────────────────────────────────────────────────

function StatsRow({ stats }: { stats: ProviderStats }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <StatCard label="Jobs completed" value={stats.jobsCompleted.toString()} />
      <StatCard label="Avg rating" value={`⭐ ${stats.avgRating}`} />
      <StatCard label="Response rate" value={`${Math.round(stats.responseRate * 100)}%`} />
      <StatCard label="Revenue (month)" value={`$${stats.revenueThisMonth.toLocaleString()}`} />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-dark/10 p-4 shadow-sm">
      <p className="text-xs text-dark/45 font-medium mb-1">{label}</p>
      <p className="text-xl font-bold text-dark">{value}</p>
    </div>
  );
}

// ── Job Card ────────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  plumbing: 'bg-blue-100 text-blue-700',
  hvac: 'bg-purple-100 text-purple-700',
  electrical: 'bg-yellow-100 text-yellow-700',
  roofing: 'bg-red-100 text-red-700',
  landscaping: 'bg-green-100 text-green-700',
};

const SEVERITY_STYLES: Record<Severity, { dot: string; label: string }> = {
  low: { dot: 'bg-green-500', label: 'Low' },
  moderate: { dot: 'bg-yellow-500', label: 'Moderate' },
  high: { dot: 'bg-orange-500', label: 'High' },
  critical: { dot: 'bg-red-500', label: 'Critical' },
};

function JobCard({ job, onClick }: { job: PortalJob; onClick: () => void }) {
  const catStyle = CATEGORY_COLORS[job.category] ?? 'bg-dark/10 text-dark/70';
  const sev = SEVERITY_STYLES[job.severity];

  return (
    <button
      onClick={onClick}
      className="text-left bg-white rounded-2xl border border-dark/10 shadow-sm p-5 hover:border-dark/20 hover:shadow-md transition-all group"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="font-bold text-dark group-hover:text-orange-600 transition-colors leading-snug">
          {job.title}
        </h3>
        <span className={`${catStyle} text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0`}>
          {job.category}
        </span>
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-dark/50 mb-3">
        <span className="flex items-center gap-1">
          <PinIcon />
          {job.zipCode} · {job.distanceMiles} mi
        </span>
        <span className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${sev.dot}`} />
          {sev.label}
        </span>
        <span>{job.timing}</span>
      </div>

      {/* Budget + confidence */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-dark">{job.budgetRange}</span>
        <span className="text-xs text-dark/40">
          AI confidence: <strong className="text-dark/70">{Math.round(job.confidence * 100)}%</strong>
        </span>
      </div>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-dark/5 flex items-center justify-between">
        {job.status === 'completed' && job.review && (
          <span className="text-xs text-dark/50">
            {'⭐'.repeat(job.review.rating)}
          </span>
        )}
        {job.status === 'accepted' && (
          <span className="text-xs text-green-600 font-medium">Quoted ${job.quotedPrice}</span>
        )}
        {job.status === 'new' && <span />}
        <span className="text-xs text-orange-500 font-semibold group-hover:text-orange-600 transition-colors">
          View details →
        </span>
      </div>
    </button>
  );
}

// ── Job Detail ──────────────────────────────────────────────────────────────

function JobDetail({ job, onBack }: { job: PortalJob; onBack: () => void }) {
  useDocumentTitle(job.title);
  const [price, setPrice] = useState(job.quotedPrice ?? '');
  const [availability, setAvailability] = useState(job.quotedAvailability ?? '');
  const [message, setMessage] = useState(job.quotedMessage ?? '');
  const [submitted, setSubmitted] = useState(job.status !== 'new');

  const sev = SEVERITY_STYLES[job.severity];
  const catStyle = CATEGORY_COLORS[job.category] ?? 'bg-dark/10 text-dark/70';

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
  }

  return (
    <div className="min-h-screen bg-warm">
      <PortalHeader />

      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Back button */}
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-dark/50 hover:text-dark transition-colors mb-6"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back to dashboard
        </button>

        {/* Title section */}
        <div className="flex flex-wrap items-start gap-3 mb-6">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold mb-2">{job.title}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`${catStyle} text-xs font-semibold px-2.5 py-0.5 rounded-full`}>
                {job.category}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-dark/50">
                <span className={`w-2 h-2 rounded-full ${sev.dot}`} />
                {sev.label} severity
              </span>
              <span className="text-xs text-dark/50">
                {job.zipCode} · {job.distanceMiles} mi
              </span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-lg font-bold text-dark">{job.budgetRange}</p>
            <p className="text-xs text-dark/40">{job.timing}</p>
          </div>
        </div>

        <div className="space-y-5">
          {/* AI diagnostic summary */}
          <DetailSection title="AI Diagnostic Summary">
            <p className="text-sm text-dark/70 leading-relaxed">{job.summary}</p>

            {job.homeownerNote && (
              <div className="mt-4 bg-orange-500/5 border border-orange-500/15 rounded-xl p-4">
                <p className="text-xs font-semibold text-orange-600 mb-1">Homeowner note</p>
                <p className="text-sm text-dark/70 italic">"{job.homeownerNote}"</p>
              </div>
            )}
          </DetailSection>

          {/* Recommended actions */}
          <DetailSection title="Recommended Actions">
            <ol className="space-y-2">
              {job.recommendedActions.map((action, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-dark/70">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-dark/5 text-dark/40 flex items-center justify-center text-xs font-bold">
                    {i + 1}
                  </span>
                  {action}
                </li>
              ))}
            </ol>
          </DetailSection>

          {/* Confidence */}
          <DetailSection title="AI Confidence">
            <div className="flex items-center gap-4">
              <div className="flex-1 h-3 bg-dark/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all duration-700"
                  style={{ width: `${job.confidence * 100}%` }}
                />
              </div>
              <span className="text-lg font-bold text-dark shrink-0">
                {Math.round(job.confidence * 100)}%
              </span>
            </div>
            <p className="text-xs text-dark/40 mt-2">
              {job.confidence >= 0.85
                ? 'High confidence — diagnosis is well-supported by the description.'
                : job.confidence >= 0.7
                  ? 'Moderate confidence — on-site inspection will clarify.'
                  : 'Lower confidence — multiple possible causes, inspection recommended.'}
            </p>
          </DetailSection>

          {/* Photos */}
          {job.photos.length > 0 && (
            <DetailSection title="Photos">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {job.photos.map((url, i) => (
                  <div key={i} className="aspect-square rounded-xl bg-dark/5 overflow-hidden">
                    <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            </DetailSection>
          )}
          {job.photos.length === 0 && (
            <DetailSection title="Photos">
              <div className="flex items-center justify-center py-6 rounded-xl bg-dark/[0.03] border border-dashed border-dark/10">
                <p className="text-sm text-dark/30">No photos provided by homeowner</p>
              </div>
            </DetailSection>
          )}

          {/* Review (completed jobs) */}
          {job.status === 'completed' && job.review && (
            <DetailSection title="Homeowner Review">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{'⭐'.repeat(job.review.rating)}</span>
                <span className="text-sm font-semibold text-dark">{job.review.rating}.0</span>
              </div>
              <p className="text-sm text-dark/70 italic">"{job.review.comment}"</p>
            </DetailSection>
          )}

          {/* Quote form / status */}
          {job.status === 'new' && !submitted && (
            <DetailSection title="Submit Your Quote">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-dark mb-1.5">Your price</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-dark/40 font-medium">$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={price}
                      onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))}
                      placeholder="e.g. 185"
                      required
                      className="w-full bg-warm rounded-xl pl-8 pr-4 py-3 text-sm text-dark placeholder:text-dark/30 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-dark mb-1.5">Your availability</label>
                  <input
                    type="text"
                    value={availability}
                    onChange={(e) => setAvailability(e.target.value)}
                    placeholder="e.g. Tomorrow 9–11 AM"
                    required
                    className="w-full bg-warm rounded-xl px-4 py-3 text-sm text-dark placeholder:text-dark/30 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-dark mb-1.5">
                    Message to homeowner <span className="text-dark/30 font-normal">(optional)</span>
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Any notes about the job, your experience with this type of repair, etc."
                    rows={3}
                    className="w-full bg-warm rounded-xl px-4 py-3 text-sm text-dark placeholder:text-dark/30 focus:outline-none focus:ring-2 focus:ring-orange-500/30 resize-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-3 rounded-full transition-colors"
                >
                  Submit quote
                </button>
              </form>
            </DetailSection>
          )}

          {/* Submitted / waiting state */}
          {(submitted && job.status === 'new') && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-6 text-center animate-fade-in">
              <div className="w-12 h-12 bg-green-500/15 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-dark mb-1">Quote submitted!</h3>
              <p className="text-sm text-dark/50 mb-3">
                ${price} · {availability}
              </p>
              <div className="flex items-center justify-center gap-2 text-sm text-dark/40">
                <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                Waiting for homeowner to respond
              </div>
            </div>
          )}

          {/* Accepted jobs — show submitted quote */}
          {job.status === 'accepted' && (
            <DetailSection title="Your Quote">
              <div className="bg-warm rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-dark/50">Price</span>
                  <span className="font-semibold">${job.quotedPrice}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-dark/50">Availability</span>
                  <span className="font-semibold">{job.quotedAvailability}</span>
                </div>
                {job.quotedMessage && (
                  <div className="pt-2 border-t border-dark/10">
                    <p className="text-sm text-dark/60 italic">"{job.quotedMessage}"</p>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-center gap-2 text-sm text-dark/40 mt-4">
                <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                Waiting for homeowner to respond
              </div>
            </DetailSection>
          )}

          {/* Completed jobs — show final */}
          {job.status === 'completed' && (
            <DetailSection title="Job Summary">
              <div className="bg-warm rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-dark/50">Final price</span>
                  <span className="font-semibold">${job.quotedPrice}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-dark/50">Completed</span>
                  <span className="font-semibold">{job.quotedAvailability}</span>
                </div>
              </div>
            </DetailSection>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Shared detail section ───────────────────────────────────────────────────

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-2xl border border-dark/10 shadow-sm p-5">
      <h3 className="text-sm font-bold text-dark mb-3">{title}</h3>
      {children}
    </section>
  );
}

// ── Icons ───────────────────────────────────────────────────────────────────

function PinIcon() {
  return (
    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
    </svg>
  );
}
