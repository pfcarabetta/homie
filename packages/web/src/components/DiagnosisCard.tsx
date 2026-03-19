import { useState } from 'react';

const CAT_ICONS: Record<string, string> = {
  plumbing: '🔧', electrical: '⚡', hvac: '❄️', appliance: '🔌',
  structural: '🏗️', roofing: '🏠', pest: '🐛', landscaping: '🌿', general: '🛠️',
  painting: '🎨', flooring: '🪵', handyman: '🛠️', pest_control: '🐛', cleaning: '🧹',
};

const SEV_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  low: { bg: 'bg-green-500/10', text: 'text-green-600', label: 'Low Severity' },
  medium: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Medium Severity' },
  moderate: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Medium Severity' },
  high: { bg: 'bg-orange-500/10', text: 'text-orange-600', label: 'High Severity' },
  urgent: { bg: 'bg-red-100', text: 'text-red-700', label: 'Urgent' },
  critical: { bg: 'bg-red-100', text: 'text-red-700', label: 'Urgent' },
  emergency: { bg: 'bg-red-100', text: 'text-red-700', label: 'Urgent' },
};

export interface DiagnosisData {
  issue: string;
  category: string;
  severity: string;
  diy_feasible: boolean;
  confidence: number;
  estimated_cost_diy: string;
  estimated_cost_pro: string;
  estimated_time_diy?: string;
  tools_needed?: string[];
  steps?: string[];
  safety_warnings?: string[];
  when_to_call_pro?: string;
}

interface DiagnosisCardProps {
  diagnosis: DiagnosisData;
  onFindPro: () => void;
}

export default function DiagnosisCard({ diagnosis: d, onFindPro }: DiagnosisCardProps) {
  const [showSteps, setShowSteps] = useState(true);
  const icon = CAT_ICONS[d.category] ?? '🛠️';
  const sev = SEV_STYLES[d.severity] ?? SEV_STYLES.medium;

  return (
    <div className="bg-white rounded-2xl border border-dark/10 overflow-hidden shadow-sm mt-3">
      {/* Header */}
      <div className="px-5 py-4 border-b border-dark/5 flex items-center gap-3">
        <span className="text-[28px]">{icon}</span>
        <div className="flex-1 min-w-0">
          <h3 className="text-[17px] font-bold text-dark font-sans">{d.issue}</h3>
          <p className="text-[13px] text-dark/50 capitalize mt-0.5">{d.category}</p>
        </div>
        <span className={`${sev.bg} ${sev.text} text-xs font-bold px-3 py-1 rounded-full shrink-0`}>
          {sev.label}
        </span>
      </div>

      <div className="px-5 py-5 space-y-4">
        {/* DIY or Pro recommendation banner */}
        <div className={`rounded-xl p-4 flex items-center gap-3 ${d.diy_feasible ? 'bg-green-500/10' : 'bg-orange-500/[0.08]'}`}>
          <span className="text-2xl">{d.diy_feasible ? '✅' : '👷'}</span>
          <div>
            <p className="font-bold text-[15px] text-dark">
              {d.diy_feasible ? "You got this — DIY Recommended" : "Homie Pro Recommended"}
            </p>
            <p className="text-[13px] text-dark/60 mt-0.5">
              {d.diy_feasible
                ? `Est. ${d.estimated_time_diy ?? 'under 1 hour'} · ${d.estimated_cost_diy} in materials`
                : `Est. professional cost: ${d.estimated_cost_pro}`}
            </p>
          </div>
        </div>

        {/* Steps */}
        {d.diy_feasible && d.steps && d.steps.length > 0 && (
          <div>
            <button
              onClick={() => setShowSteps(!showSteps)}
              className="text-sm font-bold text-dark mb-2 flex items-center gap-1"
            >
              Here's how to fix it
              <svg className={`w-4 h-4 transition-transform ${showSteps ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
            {showSteps && (
              <div className="space-y-1.5 animate-fade-in">
                {d.steps.map((step, i) => (
                  <div key={i} className="flex gap-2.5 items-start">
                    <span className="w-[22px] h-[22px] rounded-full bg-orange-500 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <span className="text-sm text-dark/70 leading-relaxed">{step}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tools needed */}
        {d.tools_needed && d.tools_needed.length > 0 && (
          <div>
            <p className="text-sm font-bold text-dark mb-2">What you'll need</p>
            <div className="flex flex-wrap gap-1.5">
              {d.tools_needed.map((tool) => (
                <span key={tool} className="bg-warm text-dark/60 text-[13px] px-3 py-1 rounded-lg border border-dark/5">
                  {tool}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Safety warnings */}
        {d.safety_warnings && d.safety_warnings.length > 0 && (
          <div className="bg-amber-50 rounded-xl px-4 py-3 border border-amber-200">
            <p className="text-[13px] font-bold text-amber-700 mb-1">⚠️ Heads up — safety first</p>
            {d.safety_warnings.map((w, i) => (
              <p key={i} className="text-[13px] text-amber-800 leading-relaxed">{w}</p>
            ))}
          </div>
        )}

        {/* Cost comparison */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="bg-warm rounded-xl p-3.5 text-center border border-dark/5">
            <p className="text-xs text-dark/45 font-semibold">DIY Cost</p>
            <p className="text-xl font-extrabold text-green-500 mt-1">{d.estimated_cost_diy}</p>
          </div>
          <div className="bg-warm rounded-xl p-3.5 text-center border border-dark/5">
            <p className="text-xs text-dark/45 font-semibold">Homie Pro Cost</p>
            <p className="text-xl font-extrabold text-orange-500 mt-1">{d.estimated_cost_pro}</p>
          </div>
        </div>

        {/* When to call a pro */}
        {d.when_to_call_pro && (
          <div className="bg-warm rounded-xl px-4 py-3 text-[13px] text-dark/60 leading-relaxed border border-dark/5">
            <strong className="text-dark">When to call a Homie Pro:</strong> {d.when_to_call_pro}
          </div>
        )}

        {/* CTA */}
        <button
          onClick={onFindPro}
          className="w-full py-3.5 bg-gradient-to-br from-orange-500 to-orange-600 text-white font-bold rounded-xl text-[15px] hover:shadow-lg hover:shadow-orange-500/30 hover:-translate-y-px transition-all"
        >
          {d.diy_feasible ? 'Still want help? Get a Homie Pro →' : 'Get matched with a Homie Pro →'}
        </button>
      </div>
    </div>
  );
}
