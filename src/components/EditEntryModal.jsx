import { useState } from 'react';
import { X, Save, Clock, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

export default function EditEntryModal({ entry, onClose, onSave }) {
  const [rawText, setRawText] = useState(entry.raw_text);
  const [timestamp, setTimestamp] = useState(
    format(new Date(entry.timestamp), "yyyy-MM-dd'T'HH:mm")
  );
  const [severity, setSeverity] = useState(entry.severity);
  const [saving, setSaving] = useState(false);

  const severityLabels = ['', 'Minimal', 'Mild', 'Moderate', 'Severe', 'Extreme'];
  const severityColors = ['', '#00b894', '#74b9ff', '#fdcb6e', '#e17055', '#ff6b6b'];

  const handleSave = async () => {
    setSaving(true);
    await onSave(entry.id, {
      raw_text: rawText,
      timestamp: new Date(timestamp).toISOString(),
      severity,
    });
    setSaving(false);
  };

  const hasChanges =
    rawText !== entry.raw_text ||
    timestamp !== format(new Date(entry.timestamp), "yyyy-MM-dd'T'HH:mm") ||
    severity !== entry.severity;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ padding: '28px 32px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 800 }}>Edit Entry</h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
              Retroactive correction — adjust what happened and when
            </p>
          </div>
          <button className="btn-ghost" onClick={onClose} style={{ padding: 6 }}>
            <X size={18} />
          </button>
        </div>

        {/* Original timestamp notice */}
        {entry.original_timestamp && (
          <div
            className="animate-fade-in"
            style={{
              padding: '10px 14px', borderRadius: 'var(--radius-sm)',
              background: 'rgba(253, 203, 110, 0.1)', border: '1px solid rgba(253, 203, 110, 0.2)',
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18,
              fontSize: '0.75rem', color: '#e17055',
            }}
          >
            <AlertTriangle size={14} />
            Originally logged: {format(new Date(entry.original_timestamp), 'MMM d, yyyy h:mm a')}
          </div>
        )}

        {/* Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Description */}
          <div>
            <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6, display: 'block' }}>
              Description
            </label>
            <textarea
              className="input"
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={3}
              style={{ resize: 'vertical', minHeight: 80, lineHeight: 1.5 }}
            />
          </div>

          {/* Timestamp */}
          <div>
            <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Clock size={13} />
              When did this actually happen?
            </label>
            <input
              type="datetime-local"
              className="input"
              value={timestamp}
              onChange={(e) => setTimestamp(e.target.value)}
            />
          </div>

          {/* Severity */}
          <div>
            <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 10, display: 'block' }}>
              Severity: <span style={{ color: severityColors[severity], fontWeight: 800 }}>{severityLabels[severity]}</span>
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[1, 2, 3, 4, 5].map((level) => (
                <button
                  key={level}
                  onClick={() => setSeverity(level)}
                  style={{
                    flex: 1,
                    height: 40,
                    borderRadius: 'var(--radius-sm)',
                    border: severity === level ? `2px solid ${severityColors[level]}` : '1.5px solid var(--color-border)',
                    background: severity === level ? `${severityColors[level]}15` : 'var(--color-surface)',
                    color: severity === level ? severityColors[level] : 'var(--color-text-muted)',
                    fontWeight: 700,
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-sans)',
                    transition: 'all var(--transition-fast)',
                    transform: severity === level ? 'scale(1.05)' : 'scale(1)',
                  }}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
          <button className="btn-secondary" onClick={onClose} style={{ flex: 1 }}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={!hasChanges || saving}
            style={{ flex: 1 }}
          >
            <Save size={16} />
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
