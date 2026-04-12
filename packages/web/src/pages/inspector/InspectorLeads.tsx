import { useState, useEffect } from 'react';
import { inspectorService, type Lead } from '@/services/inspector-api';

const O = '#E8632B';
const G = '#1B9E77';
const D = '#2D2926';

const TABS = ['new', 'accepted', 'converted', 'all'] as const;
type TabFilter = typeof TABS[number];

function formatTimeLeft(expiresAt: string): string {
  const now = new Date().getTime();
  const exp = new Date(expiresAt).getTime();
  const diff = exp - now;
  if (diff <= 0) return 'Expired';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h left`;
  }
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function InspectorLeads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabFilter>('new');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await inspectorService.getLeads(activeTab === 'all' ? undefined : activeTab);
        if (res.data) setLeads(res.data);
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [activeTab]);

  async function handleAccept(leadId: string) {
    setActionLoading(leadId);
    try {
      const res = await inspectorService.acceptLead(leadId);
      if (res.data) {
        setLeads(prev => prev.map(l => l.id === leadId ? res.data! : l));
      }
    } catch {
      // silently fail
    } finally {
      setActionLoading(null);
    }
  }

  async function handlePass(leadId: string) {
    setActionLoading(leadId);
    try {
      const res = await inspectorService.passLead(leadId);
      if (res.data) {
        setLeads(prev => prev.filter(l => l.id !== leadId));
      }
    } catch {
      // silently fail
    } finally {
      setActionLoading(null);
    }
  }

  async function handleConvert(leadId: string) {
    setActionLoading(leadId);
    try {
      const res = await inspectorService.convertLead(leadId);
      if (res.data) {
        setLeads(prev => prev.map(l => l.id === leadId ? res.data! : l));
      }
    } catch {
      // silently fail
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 28, fontWeight: 700, color: D, margin: '0 0 24px' }}>
        Leads
      </h1>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #E0DAD4' }}>
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '10px 16px', background: 'none', border: 'none',
              borderBottom: activeTab === tab ? `2px solid ${O}` : '2px solid transparent',
              color: activeTab === tab ? O : '#9B9490',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
              textTransform: 'capitalize',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: '#9B9490', fontSize: 14 }}>Loading leads...</div>
      ) : leads.length === 0 ? (
        <div style={{
          background: '#ffffff', borderRadius: 14, border: '1px solid #E0DAD4', padding: 40, textAlign: 'center',
        }}>
          <div style={{ fontSize: 14, color: '#9B9490' }}>No leads found.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {leads.map(lead => {
            const isExpired = new Date(lead.expiresAt).getTime() < Date.now();
            const isLoading = actionLoading === lead.id;

            return (
              <div key={lead.id} style={{
                background: '#ffffff', borderRadius: 14, border: '1px solid #E0DAD4', padding: 20,
                opacity: isExpired && lead.status === 'new' ? 0.6 : 1,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: D }}>{lead.homeownerName}</div>
                  {lead.status === 'new' && (
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: isExpired ? '#E24B4A' : O,
                    }}>
                      {formatTimeLeft(lead.expiresAt)}
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 100,
                    background: '#F5F0EB', color: '#6B6560',
                  }}>
                    {lead.area}
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 100,
                    background: '#E3F2FD', color: '#1565C0',
                  }}>
                    {lead.type}
                  </span>
                </div>

                <div style={{ fontSize: 13, color: '#6B6560', marginBottom: 4 }}>
                  Timing: {lead.timing}
                </div>
                <div style={{ fontSize: 12, color: '#9B9490', marginBottom: 12 }}>
                  Received {formatDate(lead.createdAt)}
                </div>

                {lead.status === 'new' && !isExpired && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => handleAccept(lead.id)}
                      disabled={isLoading}
                      style={{
                        flex: 1, padding: '8px 0', background: G, color: '#fff', border: 'none',
                        borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: isLoading ? 'not-allowed' : 'pointer',
                        fontFamily: "'DM Sans', sans-serif", opacity: isLoading ? 0.7 : 1,
                      }}
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handlePass(lead.id)}
                      disabled={isLoading}
                      style={{
                        flex: 1, padding: '8px 0', background: '#F5F0EB', color: '#6B6560', border: 'none',
                        borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: isLoading ? 'not-allowed' : 'pointer',
                        fontFamily: "'DM Sans', sans-serif", opacity: isLoading ? 0.7 : 1,
                      }}
                    >
                      Pass
                    </button>
                  </div>
                )}

                {lead.status === 'accepted' && (
                  <button
                    onClick={() => handleConvert(lead.id)}
                    disabled={isLoading}
                    style={{
                      width: '100%', padding: '8px 0', background: O, color: '#fff', border: 'none',
                      borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: isLoading ? 'not-allowed' : 'pointer',
                      fontFamily: "'DM Sans', sans-serif", opacity: isLoading ? 0.7 : 1,
                    }}
                  >
                    Mark as Converted
                  </button>
                )}

                {lead.status === 'converted' && (
                  <div style={{
                    padding: '6px 0', textAlign: 'center', fontSize: 13, fontWeight: 600, color: G,
                  }}>
                    Converted
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
