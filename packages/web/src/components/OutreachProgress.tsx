import { useEffect, useState, useRef } from 'react';

interface ChannelProgress {
  attempted: number;
  responded: number;
}

interface OutreachProgressProps {
  providersContacted: number;
  channels: {
    voice: ChannelProgress;
    sms: ChannelProgress;
    web: ChannelProgress;
  };
  active: boolean;
  expiresAt: string;
}

function AnimatedCounter({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);

  useEffect(() => {
    const start = prev.current;
    const diff = value - start;
    if (diff === 0) return;

    const steps = Math.min(Math.abs(diff), 20);
    const stepDuration = 400 / steps;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      setDisplay(Math.round(start + (diff * step) / steps));
      if (step >= steps) {
        clearInterval(timer);
        prev.current = value;
      }
    }, stepDuration);

    return () => clearInterval(timer);
  }, [value]);

  return <span>{display}</span>;
}

function TimeRemaining({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState('');

  useEffect(() => {
    function update() {
      const ms = new Date(expiresAt).getTime() - Date.now();
      if (ms <= 0) {
        setRemaining('Expired');
        return;
      }
      const totalSec = Math.floor(ms / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      setRemaining(`${min}:${sec.toString().padStart(2, '0')}`);
    }
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return <span>{remaining}</span>;
}

const CHANNEL_CONFIG = [
  { key: 'voice' as const, label: 'Voice', icon: '📞' },
  { key: 'sms' as const, label: 'SMS', icon: '💬' },
  { key: 'web' as const, label: 'Web', icon: '🌐' },
];

export default function OutreachProgress({
  providersContacted,
  channels,
  active,
  expiresAt,
}: OutreachProgressProps) {
  return (
    <div className="bg-white rounded-2xl border border-dark/10 shadow-sm p-5">
      {/* Top row: count + spinner + timer */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          {active && (
            <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          )}
          <div>
            <p className="text-sm text-dark/50 font-medium">Providers contacted</p>
            <p className="text-3xl font-bold text-dark">
              <AnimatedCounter value={providersContacted} />
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-dark/40 font-medium">Time remaining</p>
          <p className="text-lg font-bold text-dark tabular-nums">
            <TimeRemaining expiresAt={expiresAt} />
          </p>
        </div>
      </div>

      {/* Channel indicators */}
      <div className="grid grid-cols-3 gap-3">
        {CHANNEL_CONFIG.map(({ key, label, icon }) => {
          const ch = channels[key];
          const pct = ch.attempted > 0 ? (ch.responded / ch.attempted) * 100 : 0;
          return (
            <div key={key} className="bg-warm rounded-xl p-3 text-center">
              <p className="text-lg mb-1">{icon}</p>
              <p className="text-xs font-semibold text-dark mb-2">{label}</p>
              <div className="h-1.5 bg-dark/10 rounded-full overflow-hidden mb-2">
                <div
                  className="h-full bg-green-500 rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-xs text-dark/50 tabular-nums">
                {ch.responded}/{ch.attempted}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
