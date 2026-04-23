import { useRef, useState } from 'react';
import { modelScanService, type ModelScanResult } from '@/services/api';
import { iqLabelFor } from '@/utils/home-iq';

/**
 * Inline chat card shown when the AI emits a <scan_request> tag — invites
 * the homeowner to snap a photo of the model-number sticker on the
 * appliance they're discussing. On upload, posts to /scan-model-label
 * where Claude Vision extracts brand/model/serial, which we then display
 * back inline + (if authenticated) silently add to Home IQ.
 *
 * Fail-soft by design: if the label can't be read, we show a friendly
 * "couldn't quite read that — want to try again or skip?" prompt; the
 * chat never blocks on a successful scan.
 */

const O = '#E8632B', G = '#1B9E77', D = '#2D2926', W = '#F9F5F2';
const DIM = '#6B6560';
const BORDER = 'rgba(0,0,0,.08)';

interface ModelScanCardProps {
  itemType: string;
  /** Fires when the scan completes (successfully or not) so the parent
   *  can feed the extracted brand/model back into the chat context — the
   *  AI's next turn can then reference it. */
  onComplete?: (result: ModelScanResult) => void;
  /** User dismissed the card without scanning — parent clears it. */
  onDismiss: () => void;
}

export default function ModelScanCard({ itemType, onComplete, onDismiss }: ModelScanCardProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ModelScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const itemLabel = iqLabelFor(itemType);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const { data, error: err } = await modelScanService.scanLabel({
        imageDataUrl: dataUrl, itemTypeHint: itemType,
      });
      if (err || !data) {
        setError(err || "Couldn't read the label — try a clearer photo?");
        setUploading(false);
        return;
      }
      setResult(data);
      setUploading(false);
      onComplete?.(data);
    } catch {
      setError("Couldn't read the photo — try again?");
      setUploading(false);
    }
  }

  // ── Successful scan ────────────────────────────────────────────────
  if (result && (result.brand || result.modelNumber)) {
    return (
      <div style={cardShell(G)}>
        <Header
          icon="✅"
          title={`Got it — ${itemLabel} identified`}
          tone={G}
          subtitle={result.savedToHomeIQ ? 'Saved to your Home IQ' : 'Using this for your diagnosis'}
        />
        <div style={{
          marginTop: 10, padding: 12, background: W, borderRadius: 10,
          border: `1px solid ${BORDER}`,
        }}>
          {result.brand && <Row label="Brand" value={result.brand} />}
          {result.modelNumber && <Row label="Model" value={result.modelNumber} mono />}
          {result.serialNumber && <Row label="Serial" value={result.serialNumber} mono />}
        </div>
      </div>
    );
  }

  // ── Low-confidence / no-label scan ─────────────────────────────────
  if (result && !result.brand && !result.modelNumber) {
    return (
      <div style={cardShell(O)}>
        <Header icon="🤔" title="Hmm, couldn't read that one" tone={O}
          subtitle="Want to try a closer/sharper shot, or skip and keep going?" />
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={() => { setResult(null); fileRef.current?.click(); }} style={primaryBtn}>
            Try another photo
          </button>
          <button onClick={onDismiss} style={secondaryBtn}>Skip</button>
        </div>
      </div>
    );
  }

  // ── Initial / error state — upload prompt ──────────────────────────
  return (
    <div style={cardShell(O)}>
      <Header
        icon="📷"
        title={`Snap the ${itemLabel.toLowerCase()} model label`}
        tone={O}
        subtitle="Usually inside the door, on the back, or near the controls. Homie reads it, saves the brand + model, and checks warranty + recalls."
      />
      {error && (
        <div style={{
          marginTop: 10, padding: '8px 10px', fontSize: 12, color: O,
          background: `${O}08`, borderRadius: 8,
        }}>{error}</div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          style={{ ...primaryBtn, opacity: uploading ? 0.6 : 1 }}
        >
          {uploading ? 'Reading label…' : '📸 Scan the label'}
        </button>
        <button onClick={onDismiss} disabled={uploading} style={secondaryBtn}>
          Skip for now
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={handleFileChange}
      />
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error('Could not read file'));
    r.readAsDataURL(file);
  });
}

function cardShell(accent: string): React.CSSProperties {
  return {
    marginLeft: 42, marginBottom: 16,
    padding: 14, background: '#fff',
    border: `1px solid ${accent}33`, borderRadius: 14,
    animation: 'fadeSlide 0.3s ease',
  };
}

function Header({ icon, title, subtitle, tone }: {
  icon: string; title: string; subtitle: string; tone: string;
}) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <div style={{
        width: 36, height: 36, borderRadius: 9, background: `${tone}14`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, flexShrink: 0,
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "'Fraunces',serif", fontSize: 14, fontWeight: 700, color: D, lineHeight: 1.25 }}>
          {title}
        </div>
        <div style={{ fontSize: 12, color: DIM, marginTop: 3, lineHeight: 1.4 }}>
          {subtitle}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', padding: '4px 0', fontSize: 13 }}>
      <div style={{ width: 80, color: DIM }}>{label}</div>
      <div style={{
        flex: 1, fontWeight: 700, color: D,
        fontFamily: mono ? "'DM Mono',monospace" : "'DM Sans',sans-serif",
      }}>{value}</div>
    </div>
  );
}

const primaryBtn: React.CSSProperties = {
  padding: '10px 16px', background: O, color: '#fff', border: 'none',
  borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  fontFamily: "'DM Sans',sans-serif",
};

const secondaryBtn: React.CSSProperties = {
  padding: '10px 16px', background: 'transparent', color: DIM,
  border: `1px solid ${BORDER}`, borderRadius: 10, fontSize: 13, fontWeight: 600,
  cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
};
