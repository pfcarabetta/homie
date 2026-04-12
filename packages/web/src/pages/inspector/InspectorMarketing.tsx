import { useState } from 'react';
import { useInspectorAuth } from '@/contexts/InspectorAuthContext';

const O = '#E8632B';
const G = '#1B9E77';
const D = '#2D2926';
const W = '#F9F5F2';

interface MaterialSection {
  title: string;
  description: string;
  actions: { label: string; onClick: () => void }[];
}

export default function InspectorMarketing() {
  const { inspector } = useInspectorAuth();
  const [copied, setCopied] = useState(false);

  const partnerUrl = inspector?.partnerUrl
    ? `${window.location.origin}/inspect?ref=${inspector.partnerUrl}`
    : `${window.location.origin}/inspect?ref=${inspector?.id ?? ''}`;

  function handleCopy() {
    void navigator.clipboard.writeText(partnerUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const sections: MaterialSection[] = [
    {
      title: 'Print Materials',
      description: 'Download print-ready flyers, business cards inserts, and leave-behinds to share with your clients after inspections. These materials explain the benefits of the homie inspect service.',
      actions: [
        { label: 'Download flyer (PDF)', onClick: () => {} },
        { label: 'Download business card insert', onClick: () => {} },
      ],
    },
    {
      title: 'Email Templates',
      description: 'Pre-written email templates you can customize and send to past and current clients. Introduce them to your enhanced digital reports with instant quotes.',
      actions: [
        { label: 'Copy introduction email', onClick: () => {} },
        { label: 'Copy follow-up email', onClick: () => {} },
        { label: 'Copy re-engagement email', onClick: () => {} },
      ],
    },
    {
      title: 'Social Media',
      description: 'Ready-to-post content for Facebook, Instagram, LinkedIn, and Twitter. Download images and captions to promote your enhanced inspection service.',
      actions: [
        { label: 'Download social media kit', onClick: () => {} },
        { label: 'Copy sample post', onClick: () => {} },
      ],
    },
    {
      title: 'Partner Badge',
      description: 'Display the homie partner badge on your website and marketing materials to show clients you offer enhanced digital reports with instant quotes.',
      actions: [
        { label: 'Download badge (PNG)', onClick: () => {} },
        { label: 'Download badge (SVG)', onClick: () => {} },
        { label: 'Copy embed code', onClick: () => {} },
      ],
    },
  ];

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 28, fontWeight: 700, color: D, margin: '0 0 24px' }}>
        Marketing
      </h1>

      {/* Partner URL */}
      <div style={{
        background: '#ffffff', borderRadius: 14, border: '1px solid #E0DAD4', padding: 20, marginBottom: 24,
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: D, marginBottom: 8 }}>Your Partner URL</div>
        <div style={{ fontSize: 13, color: '#6B6560', marginBottom: 12 }}>
          Share this link with clients. When they access reports through this URL, you earn referral bonuses.
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{
            flex: 1, padding: '10px 14px', background: W, borderRadius: 8,
            fontSize: 13, color: D, fontFamily: 'monospace', overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap', border: '1px solid #E0DAD4',
          }}>
            {partnerUrl}
          </div>
          <button
            onClick={handleCopy}
            style={{
              padding: '10px 20px', background: copied ? G : O, color: '#fff', border: 'none',
              borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap', transition: 'background 0.2s',
            }}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Material sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {sections.map(section => (
          <div key={section.title} style={{
            background: '#ffffff', borderRadius: 14, border: '1px solid #E0DAD4', padding: 20,
          }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: D, marginBottom: 8 }}>
              {section.title}
            </div>
            <div style={{ fontSize: 13, color: '#6B6560', lineHeight: 1.5, marginBottom: 16 }}>
              {section.description}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {section.actions.map(action => (
                <button
                  key={action.label}
                  onClick={action.onClick}
                  style={{
                    padding: '8px 16px', background: W, color: D, border: '1px solid #E0DAD4',
                    borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                    fontFamily: "'DM Sans', sans-serif", transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#F0EBE6'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = W; }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
