import { useEffect, useRef, useState } from 'react';
import { TriangleAlert, Phone, HeartHandshake } from 'lucide-react';

/**
 * Blocking safety alert shown immediately after an entry is screened as a
 * red flag. Deliberately NOT dismissable by clicking the backdrop or Esc:
 * the patient must explicitly acknowledge the guidance.
 */
export default function RedFlagAlert({ flags, onAcknowledge }) {
  const [busy, setBusy] = useState(false);
  const buttonRef = useRef(null);
  const top = flags[0];
  const isEmergency = top.level === 'emergency';
  const isCrisis = top.id === 'self_harm';
  const accent = isCrisis ? '#6c5ce7' : isEmergency ? '#d63031' : '#e17055';
  const Icon = isCrisis ? HeartHandshake : TriangleAlert;

  // Merge contacts across flags, keeping order and removing duplicates.
  const contacts = [];
  const seen = new Set();
  flags.forEach((f) => f.contacts.forEach((c) => {
    if (!seen.has(c.number)) { seen.add(c.number); contacts.push(c); }
  }));

  useEffect(() => { buttonRef.current?.focus(); }, []);

  const acknowledge = async () => {
    setBusy(true);
    try { await onAcknowledge(); } finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" role="alertdialog" aria-modal="true" aria-labelledby="redflag-title" aria-describedby="redflag-guidance">
      <div className="modal-content animate-fade-in-scale" style={{ padding: 0, overflow: 'hidden', borderColor: accent }}>
        <div style={{ background: accent, color: 'white', padding: '20px 26px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.6875rem', fontWeight: 800, letterSpacing: '0.1em', opacity: 0.9 }}>
              {isCrisis ? 'PLEASE READ' : isEmergency ? 'POSSIBLE EMERGENCY' : 'SEE A DOCTOR TODAY'}
            </div>
            <h2 id="redflag-title" style={{ fontSize: '1.25rem', fontWeight: 800, lineHeight: 1.25 }}>{top.title}</h2>
          </div>
        </div>

        <div style={{ padding: '22px 26px' }}>
          <p id="redflag-guidance" style={{ fontSize: '0.95rem', lineHeight: 1.6, color: 'var(--color-text-primary)', marginBottom: 14 }}>
            {top.guidance}
          </p>

          {flags.slice(1).map((f) => (
            <p key={f.id} style={{ fontSize: '0.8125rem', lineHeight: 1.5, color: 'var(--color-text-secondary)', marginBottom: 10 }}>
              <strong>{f.title}.</strong> {f.guidance}
            </p>
          ))}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, margin: '18px 0' }}>
            {contacts.map((c) => (
              <a
                key={c.number}
                href={`tel:${c.number}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)', border: `1.5px solid ${accent}`,
                  color: accent, textDecoration: 'none', background: 'var(--color-surface)',
                }}
              >
                <Phone size={16} />
                <span>
                  <span style={{ display: 'block', fontWeight: 800, fontSize: '1.05rem' }}>{c.number}</span>
                  <span style={{ display: 'block', fontSize: '0.6875rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>{c.label}</span>
                </span>
              </a>
            ))}
          </div>

          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', lineHeight: 1.5, marginBottom: 18 }}>
            Noted. flagged this automatically from the words in your entry. It cannot diagnose you and may be wrong,
            but when in doubt, please get checked. Your entry has been saved.
          </p>

          <button ref={buttonRef} className="btn-primary" onClick={acknowledge} disabled={busy} style={{ width: '100%', background: accent }}>
            I understand
          </button>
        </div>
      </div>
    </div>
  );
}
