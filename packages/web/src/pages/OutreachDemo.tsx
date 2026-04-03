import { useState, useEffect, useRef } from 'react';
import HomieOutreachLive, { type OutreachStatus, type LogEntry } from '@/components/HomieOutreachLive';

const O = '#E8632B', D = '#2D2926';

// Simulated outreach timeline
const TIMELINE: { delay: number; action: (set: {
  setStatus: React.Dispatch<React.SetStateAction<OutreachStatus>>;
  addLog: (entry: LogEntry) => void;
  setDone: React.Dispatch<React.SetStateAction<boolean>>;
}) => void }[] = [
  { delay: 0, action: ({ addLog }) => addLog({ msg: 'Analyzing your issue...', type: 'system' }) },
  { delay: 800, action: ({ addLog }) => addLog({ msg: 'Diagnosis complete — generating provider briefing', type: 'system' }) },
  { delay: 1600, action: ({ addLog }) => addLog({ msg: 'Found 12 providers near 92119', type: 'system' }) },
  { delay: 2200, action: ({ setStatus, addLog }) => {
    setStatus(s => ({ ...s, providers_contacted: 1, outreach_channels: { ...s.outreach_channels, voice: { attempted: 1, connected: 0 } } }));
    addLog({ msg: 'Calling Rodriguez Plumbing...', type: 'voice' });
  }},
  { delay: 3000, action: ({ setStatus, addLog }) => {
    setStatus(s => ({ ...s, providers_contacted: 2, outreach_channels: { ...s.outreach_channels, sms: { attempted: 1, connected: 0 } } }));
    addLog({ msg: 'Texting Atlas Home Services...', type: 'sms' });
  }},
  { delay: 3800, action: ({ setStatus, addLog }) => {
    setStatus(s => ({ ...s, providers_contacted: 3, outreach_channels: { ...s.outreach_channels, voice: { attempted: 2, connected: 0 } } }));
    addLog({ msg: 'Calling SD Premier Plumbing...', type: 'voice' });
  }},
  { delay: 4600, action: ({ setStatus, addLog }) => {
    setStatus(s => ({ ...s, providers_responded: 1, outreach_channels: { ...s.outreach_channels, voice: { attempted: 2, connected: 1 } } }));
    addLog({ msg: 'Rodriguez Plumbing — quote received!', type: 'success' });
  }},
  { delay: 5400, action: ({ setStatus, addLog }) => {
    setStatus(s => ({ ...s, providers_contacted: 4, outreach_channels: { ...s.outreach_channels, sms: { attempted: 2, connected: 0 } } }));
    addLog({ msg: "Texting Mike's Plumbing Co...", type: 'sms' });
  }},
  { delay: 6200, action: ({ setStatus, addLog }) => {
    setStatus(s => ({ ...s, providers_contacted: 5, outreach_channels: { ...s.outreach_channels, web: { attempted: 1, connected: 0 } } }));
    addLog({ msg: 'Submitting form on quickfixpros.com', type: 'web' });
  }},
  { delay: 7000, action: ({ addLog }) => {
    addLog({ msg: 'SD Premier — voicemail, sending SMS fallback', type: 'fallback' });
  }},
  { delay: 7800, action: ({ setStatus, addLog }) => {
    setStatus(s => ({ ...s, providers_responded: 2, outreach_channels: { ...s.outreach_channels, sms: { attempted: 2, connected: 1 } } }));
    addLog({ msg: 'Atlas Home Services — quote received!', type: 'success' });
  }},
  { delay: 8800, action: ({ addLog }) => {
    addLog({ msg: "Mike's Plumbing — declined (booked)", type: 'decline' });
  }},
  { delay: 9600, action: ({ setStatus, addLog }) => {
    setStatus(s => ({ ...s, providers_contacted: 6, outreach_channels: { ...s.outreach_channels, sms: { attempted: 3, connected: 1 } } }));
    addLog({ msg: 'Texting Reliable Plumbing & Drain...', type: 'sms' });
  }},
  { delay: 10400, action: ({ setStatus, addLog }) => {
    setStatus(s => ({ ...s, providers_contacted: 7, outreach_channels: { ...s.outreach_channels, voice: { attempted: 3, connected: 1 } } }));
    addLog({ msg: 'Calling ABC Plumbing...', type: 'voice' });
  }},
  { delay: 11400, action: ({ setStatus, addLog }) => {
    setStatus(s => ({ ...s, providers_responded: 3, outreach_channels: { ...s.outreach_channels, web: { attempted: 1, connected: 1 } } }));
    addLog({ msg: 'Quick Fix Pros — quote received!', type: 'success' });
  }},
  { delay: 12400, action: ({ setStatus, addLog, setDone }) => {
    setStatus(s => ({ ...s, status: 'completed' }));
    addLog({ msg: '3 quotes ready!', type: 'done' });
    setDone(true);
  }},
];

export default function OutreachDemo() {
  const [status, setStatus] = useState<OutreachStatus>({
    providers_contacted: 0,
    providers_responded: 0,
    outreach_channels: {
      voice: { attempted: 0, connected: 0 },
      sms: { attempted: 0, connected: 0 },
      web: { attempted: 0, connected: 0 },
    },
    status: 'dispatching',
  });
  const [log, setLog] = useState<LogEntry[]>([]);
  const [done, setDone] = useState(false);
  const [running, setRunning] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  function addLog(entry: LogEntry) {
    setLog(prev => [...prev, entry]);
  }

  function startDemo() {
    // Reset
    setStatus({
      providers_contacted: 0, providers_responded: 0,
      outreach_channels: { voice: { attempted: 0, connected: 0 }, sms: { attempted: 0, connected: 0 }, web: { attempted: 0, connected: 0 } },
      status: 'dispatching',
    });
    setLog([]);
    setDone(false);
    setRunning(true);

    timersRef.current.forEach(clearTimeout);
    timersRef.current = TIMELINE.map(({ delay, action }) =>
      setTimeout(() => action({ setStatus, addLog, setDone }), delay)
    );
  }

  useEffect(() => {
    startDemo();
    return () => timersRef.current.forEach(clearTimeout);
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#FAFAF8', fontFamily: "'DM Sans', sans-serif" }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E0DAD4', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ fontFamily: 'Fraunces, serif', fontSize: 22, fontWeight: 700, color: O }}>homie</span>
          <span style={{ fontSize: 13, color: '#9B9490', marginLeft: 12 }}>Outreach Live Demo</span>
        </div>
        <button onClick={startDemo} style={{
          padding: '8px 20px', borderRadius: 8, border: 'none', background: O, color: '#fff',
          fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}>
          {done ? 'Replay Demo' : 'Restart'}
        </button>
      </div>

      {/* Demo content */}
      <div style={{ maxWidth: 440, margin: '0 auto', padding: '0 16px' }}>
        <HomieOutreachLive
          status={status}
          log={log}
          done={done}
          headline="Your Homie's on it"
          subtext="Finding plumbers near 92119"
        />
      </div>

      {/* Raw state debug (collapsed by default) */}
      <details style={{ maxWidth: 440, margin: '24px auto', padding: '0 16px' }}>
        <summary style={{ fontSize: 12, color: '#9B9490', cursor: 'pointer' }}>Debug: raw state</summary>
        <pre style={{ fontSize: 11, background: '#fff', padding: 12, borderRadius: 8, overflow: 'auto', marginTop: 8, color: D }}>
          {JSON.stringify({ status, log: log.length, done }, null, 2)}
        </pre>
      </details>
    </div>
  );
}
