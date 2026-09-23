import { format } from 'date-fns';
import { Clock, MapPin, Edit3 } from 'lucide-react';

const severityLabels = ['', 'Minimal', 'Mild', 'Moderate', 'Severe', 'Extreme'];
const severityColors = ['', '#00b894', '#74b9ff', '#fdcb6e', '#e17055', '#ff6b6b'];

function SeverityBar({ level }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ display: 'flex', gap: 3 }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            style={{
              width: 16,
              height: 5,
              borderRadius: 3,
              background: i <= level ? severityColors[level] : '#eef0f5',
              transition: `all 0.3s ease ${i * 60}ms`,
              boxShadow: i <= level ? `0 1px 4px ${severityColors[level]}40` : 'none',
            }}
          />
        ))}
      </div>
      <span
        style={{
          fontSize: '0.6875rem',
          fontWeight: 600,
          color: severityColors[level],
        }}
      >
        {severityLabels[level]}
      </span>
    </div>
  );
}

function ContextTag({ tag }) {
  const formatted = tag.replace(/_/g, ' ');
  const tagColors = {
    poor_sleep: 'tag-warning',
    stress: 'tag-danger',
    morning: 'tag-teal',
    afternoon: 'tag-accent',
    evening: 'tag-pink',
    night: 'tag-neutral',
    after_food: 'tag-warning',
    caffeine: 'tag-warning',
  };
  const cls = tagColors[tag] || 'tag-neutral';
  return <span className={`tag ${cls}`}>{formatted}</span>;
}

export default function TimelineList({ entries, onEdit }) {
  let lastDateLabel = '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {entries.map((entry, i) => {
        const dateLabel = format(new Date(entry.timestamp), 'EEEE, MMM d');
        const showDate = dateLabel !== lastDateLabel;
        lastDateLabel = dateLabel;

        return (
          <div key={entry.id}>
            {showDate && (
              <div
                className="animate-slide-in"
                style={{
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  color: 'var(--color-accent)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  padding: '24px 0 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: 'var(--gradient-primary)',
                    boxShadow: '0 0 8px rgba(108, 92, 231, 0.3)',
                  }}
                />
                {dateLabel}
              </div>
            )}

            <div
              className="card"
              style={{
                padding: '18px 22px',
                animation: `fadeIn 0.4s ease-out ${Math.min(i * 60, 500)}ms both`,
                cursor: onEdit ? 'pointer' : 'default',
                position: 'relative',
                overflow: 'hidden',
              }}
              onClick={() => onEdit?.(entry)}
            >
              {/* Subtle left accent */}
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 3,
                  background: severityColors[entry.severity],
                  borderRadius: '3px 0 0 3px',
                }}
              />

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span className="tag tag-accent" style={{ fontWeight: 700, fontSize: '0.8125rem' }}>
                    {entry.normalized_symptom}
                  </span>
                  <SeverityBar level={entry.severity} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {onEdit && (
                    <button
                      className="btn-ghost"
                      style={{ padding: 4, opacity: 0.4 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(entry);
                      }}
                    >
                      <Edit3 size={13} />
                    </button>
                  )}
                  <span
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--color-text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      fontWeight: 500,
                    }}
                  >
                    <Clock size={12} />
                    {format(new Date(entry.timestamp), 'h:mm a')}
                  </span>
                </div>
              </div>

              <p
                style={{
                  fontSize: '0.9rem',
                  color: 'var(--color-text-secondary)',
                  lineHeight: 1.55,
                  marginBottom: 12,
                  fontStyle: 'italic',
                }}
              >
                &ldquo;{entry.raw_text}&rdquo;
              </p>

              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                  alignItems: 'center',
                }}
              >
                {entry.body_location && (
                  <span
                    className="tag tag-neutral"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    <MapPin size={10} />
                    {entry.body_location}
                  </span>
                )}
                {entry.context_tags.slice(0, 4).map((tag) => (
                  <ContextTag key={tag} tag={tag} />
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
