export type ReportMode = 'buyer' | 'seller';

interface ModeToggleProps {
  mode: ReportMode;
  onChange: (mode: ReportMode) => void;
  disabled?: boolean;
}

/**
 * Segmented control for switching a report between buyer and seller mode.
 * Buyer: negotiating with the seller (default). Seller: preparing for listing.
 */
export default function ModeToggle({ mode, onChange, disabled }: ModeToggleProps) {
  return (
    <div style={{
      display: 'inline-flex', gap: 4, padding: 3, borderRadius: 10,
      border: '1px solid var(--bp-border)', background: 'var(--bp-bg)',
    }}>
      <ModeButton
        active={mode === 'buyer'}
        onClick={() => !disabled && onChange('buyer')}
        disabled={disabled}
        icon={'\uD83C\uDFE0'}
        label="Buyer"
        activeColor="#2563EB"
      />
      <ModeButton
        active={mode === 'seller'}
        onClick={() => !disabled && onChange('seller')}
        disabled={disabled}
        icon={'\uD83C\uDFF7\uFE0F'}
        label="Seller"
        activeColor="#E8632B"
      />
    </div>
  );
}

function ModeButton({ active, onClick, disabled, icon, label, activeColor }: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  icon: string;
  label: string;
  activeColor: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '6px 14px', borderRadius: 8, border: 'none',
        background: active ? `${activeColor}15` : 'transparent',
        color: active ? activeColor : 'var(--bp-subtle)',
        fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 5,
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.12s',
      }}
    >
      <span style={{ fontSize: 13 }}>{icon}</span>
      {label}
    </button>
  );
}
