import { useState } from 'react';

type Severity = 'low' | 'moderate' | 'high' | 'critical';

interface DiagnosisCardProps {
  title: string;
  severity: Severity;
  confidence: number;
  summary: string;
  diyFeasible: boolean;
  diySteps?: string[];
  diyToolsNeeded?: string[];
  diyCostEstimate?: string;
  proCostEstimate: string;
  onFindPro: () => void;
}

const SEVERITY_STYLES: Record<Severity, { bg: string; text: string; label: string }> = {
  low: { bg: 'bg-green-500/15', text: 'text-green-600', label: 'Low' },
  moderate: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Moderate' },
  high: { bg: 'bg-orange-500/15', text: 'text-orange-600', label: 'High' },
  critical: { bg: 'bg-red-100', text: 'text-red-700', label: 'Critical' },
};

export default function DiagnosisCard({
  title,
  severity,
  confidence,
  summary,
  diyFeasible,
  diySteps,
  diyToolsNeeded,
  diyCostEstimate,
  proCostEstimate,
  onFindPro,
}: DiagnosisCardProps) {
  const [stepsOpen, setStepsOpen] = useState(false);
  const sev = SEVERITY_STYLES[severity];

  return (
    <div className="bg-white rounded-2xl border border-dark/10 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex flex-wrap items-start gap-3 mb-3">
          <h2 className="text-xl font-bold flex-1 min-w-0">{title}</h2>
          <span className={`${sev.bg} ${sev.text} text-xs font-semibold px-2.5 py-1 rounded-full shrink-0`}>
            {sev.label}
          </span>
        </div>
        <p className="text-sm text-dark/70 leading-relaxed">{summary}</p>

        {/* Confidence bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-dark/50 font-medium">Confidence</span>
            <span className="font-semibold">{Math.round(confidence * 100)}%</span>
          </div>
          <div className="h-2 bg-dark/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all duration-700"
              style={{ width: `${confidence * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* DIY vs Pro columns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 border-t border-dark/10">
        {/* DIY column */}
        <div className={`px-5 py-4 ${!diyFeasible ? 'opacity-50' : ''}`}>
          <h3 className="text-sm font-bold mb-1">DIY</h3>
          {diyFeasible ? (
            <>
              <p className="text-lg font-bold text-green-500">{diyCostEstimate ?? 'Low cost'}</p>
              {diySteps && diySteps.length > 0 && (
                <button
                  onClick={() => setStepsOpen(!stepsOpen)}
                  className="text-xs text-orange-500 hover:text-orange-600 font-medium mt-2 transition-colors"
                >
                  {stepsOpen ? 'Hide steps' : `View ${diySteps.length} steps`}
                </button>
              )}
              {stepsOpen && diySteps && (
                <div className="mt-3 animate-fade-in">
                  <ol className="text-xs text-dark/70 space-y-1.5 list-decimal list-inside">
                    {diySteps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                  {diyToolsNeeded && diyToolsNeeded.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-dark/10">
                      <p className="text-xs font-medium text-dark/50 mb-1">Tools needed</p>
                      <div className="flex flex-wrap gap-1.5">
                        {diyToolsNeeded.map((tool) => (
                          <span
                            key={tool}
                            className="bg-dark/5 text-dark/70 text-xs px-2 py-0.5 rounded-full"
                          >
                            {tool}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-dark/50 mt-1">Not recommended for this issue</p>
          )}
        </div>

        {/* Pro column */}
        <div className="px-5 py-4 sm:border-l border-t sm:border-t-0 border-dark/10">
          <h3 className="text-sm font-bold mb-1">Call a pro</h3>
          <p className="text-lg font-bold text-orange-500">{proCostEstimate}</p>
          <p className="text-xs text-dark/50 mt-1">Estimated cost range</p>
        </div>
      </div>

      {/* CTA */}
      <div className="px-5 py-4 border-t border-dark/10 bg-warm/50">
        <button
          onClick={onFindPro}
          className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 rounded-full transition-colors"
        >
          Find a Homie Pro
        </button>
      </div>
    </div>
  );
}
