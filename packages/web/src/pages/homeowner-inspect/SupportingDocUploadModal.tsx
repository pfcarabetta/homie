import { useState, useRef } from 'react';
import { inspectService } from '@/services/inspector-api';

const ACCENT = '#2563EB';

export type SupportingDocType = 'pest_report' | 'seller_disclosure';

const DOC_TYPE_META: Record<SupportingDocType, { label: string; icon: string; description: string }> = {
  pest_report: {
    label: 'Pest / WDO Report',
    icon: '\uD83D\uDC1B',
    description: 'Termite, wood-destroying organism, or pest inspection report.',
  },
  seller_disclosure: {
    label: 'Seller Disclosure',
    icon: '\uD83D\uDCCB',
    description: 'Seller\u2019s property condition disclosure form (TDS, RPCDS, etc.).',
  },
};

interface Props {
  reportId: string;
  initialType?: SupportingDocType;
  onClose: () => void;
  onUploaded: () => void;
}

export default function SupportingDocUploadModal({ reportId, initialType, onClose, onUploaded }: Props) {
  const [step, setStep] = useState<'type' | 'file' | 'uploading'>(initialType ? 'file' : 'type');
  const [docType, setDocType] = useState<SupportingDocType>(initialType ?? 'pest_report');
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function handleFile(file: File) {
    if (file.type !== 'application/pdf') {
      setError('Please upload a PDF file');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setError('File must be under 50 MB');
      return;
    }
    setError(null);
    setUploading(true);
    setStep('uploading');
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await inspectService.uploadSupportingDocument(reportId, {
          documentType: docType,
          fileName: file.name,
          fileDataUrl: reader.result as string,
        });
        if (res.error) {
          setError(res.error);
          setUploading(false);
          setStep('file');
          return;
        }
        onUploaded();
        onClose();
      } catch (err) {
        setError((err as Error).message ?? 'Upload failed');
        setUploading(false);
        setStep('file');
      }
    };
    reader.onerror = () => {
      setError('Failed to read file');
      setUploading(false);
      setStep('file');
    };
    reader.readAsDataURL(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  return (
    <div
      onClick={() => !uploading && onClose()}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bp-card)', borderRadius: 16, padding: '28px 24px',
        maxWidth: 500, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 700, color: 'var(--bp-text)', margin: 0 }}>
            {step === 'type' ? 'Add Supporting Document' : `Upload ${DOC_TYPE_META[docType].label}`}
          </h3>
          {!uploading && (
            <button onClick={onClose} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 18, color: 'var(--bp-subtle)', padding: 0,
            }}>{'\u2715'}</button>
          )}
        </div>

        {step === 'type' && (
          <>
            <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: '0 0 16px' }}>
              Choose the document type. The AI will parse it and cross-reference against your inspection.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(Object.keys(DOC_TYPE_META) as SupportingDocType[]).map(type => (
                <button
                  key={type}
                  onClick={() => { setDocType(type); setStep('file'); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '14px 16px', borderRadius: 12,
                    border: '1px solid var(--bp-border)', background: 'var(--bp-bg)',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                  onMouseOver={e => (e.currentTarget.style.borderColor = ACCENT)}
                  onMouseOut={e => (e.currentTarget.style.borderColor = 'var(--bp-border)')}
                >
                  <span style={{ fontSize: 28 }}>{DOC_TYPE_META[type].icon}</span>
                  <div>
                    <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 700, color: 'var(--bp-text)' }}>
                      {DOC_TYPE_META[type].label}
                    </div>
                    <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: 'var(--bp-subtle)', marginTop: 2 }}>
                      {DOC_TYPE_META[type].description}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 'file' && (
          <>
            <div
              onDragOver={e => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                background: dragActive ? `${ACCENT}0D` : 'var(--bp-bg)',
                border: `2px dashed ${dragActive ? ACCENT : 'var(--bp-border)'}`,
                borderRadius: 14, padding: '40px 30px', textAlign: 'center', cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              <div style={{ fontSize: 36, marginBottom: 12 }}>{'\uD83D\uDCC1'}</div>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 700, color: 'var(--bp-text)', marginBottom: 4 }}>
                {dragActive ? 'Drop your PDF here' : 'Drag & drop or click to browse'}
              </div>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: 'var(--bp-subtle)' }}>
                PDF only \u00B7 Max 50 MB
              </div>
            </div>
            {error && (
              <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: '#FEE2E2', color: '#DC2626', fontFamily: "'DM Sans',sans-serif", fontSize: 12 }}>
                {error}
              </div>
            )}
            {!initialType && (
              <button
                onClick={() => setStep('type')}
                style={{
                  marginTop: 12, fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: 'var(--bp-subtle)',
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                }}
              >
                {'\u2190'} Back to type selection
              </button>
            )}
          </>
        )}

        {step === 'uploading' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{
              width: 40, height: 40, border: '3px solid var(--bp-border)',
              borderTopColor: ACCENT, borderRadius: '50%', animation: 'spin 0.8s linear infinite',
              margin: '0 auto 16px',
            }} />
            <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--bp-text)', marginBottom: 4 }}>
              Uploading and analyzing...
            </div>
            <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: 'var(--bp-subtle)' }}>
              AI is parsing the document. This usually takes 10\u201330 seconds.
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}
      </div>
    </div>
  );
}
