import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Sparkles, Check } from 'lucide-react';

export default function QuickEntry({ onSubmit }) {
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim() || isSubmitting) return;

    setIsSubmitting(true);
    await onSubmit(text.trim());
    setText('');
    setIsSubmitting(false);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 2500);
    inputRef.current?.focus();
  };

  return (
    <div className="animate-fade-in" style={{ marginBottom: 16 }}>
      {/* Hint */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 14,
        }}
      >
        <div
          className="animate-float"
          style={{
            width: 28,
            height: 28,
            borderRadius: 'var(--radius-sm)',
            background: 'var(--gradient-warm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 3px 10px rgba(253, 121, 168, 0.2)',
          }}
        >
          <Sparkles size={14} color="white" />
        </div>
        <span
          style={{
            fontSize: '0.8125rem',
            color: 'var(--color-text-muted)',
            fontWeight: 500,
          }}
        >
          Just describe how you feel — we'll handle the rest
        </span>
      </div>

      <form onSubmit={handleSubmit}>
        <div
          style={{
            position: 'relative',
            display: 'flex',
            gap: 10,
            alignItems: 'stretch',
          }}
        >
          <div style={{ flex: 1, position: 'relative' }}>
            <input
              ref={inputRef}
              type="text"
              className="input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="stomach's been off since lunch..."
              disabled={isSubmitting}
              style={{
                height: 56,
                borderRadius: 'var(--radius-md)',
                fontSize: '1rem',
                paddingLeft: 20,
                paddingRight: 20,
                boxShadow: 'var(--shadow-sm)',
                border: '1.5px solid var(--color-border)',
              }}
            />
            {/* Animated underline */}
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: '50%',
                transform: `translateX(-50%) scaleX(${text ? 1 : 0})`,
                width: 'calc(100% - 24px)',
                height: 2,
                background: 'var(--gradient-primary)',
                borderRadius: 1,
                transition: 'transform 0.3s ease',
              }}
            />
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={!text.trim() || isSubmitting}
            style={{
              height: 56,
              width: 56,
              padding: 0,
              borderRadius: 'var(--radius-md)',
              flexShrink: 0,
              fontSize: 0,
            }}
          >
            {isSubmitting ? (
              <Loader2 size={20} style={{ animation: 'spin 0.8s linear infinite' }} />
            ) : (
              <Send size={19} />
            )}
          </button>
        </div>

        {/* Success toast */}
        {showSuccess && (
          <div
            className="animate-slide-up"
            style={{
              marginTop: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 16px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-success-bg)',
              border: '1px solid rgba(0, 184, 148, 0.2)',
            }}
          >
            <div
              className="animate-bounce-in"
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: 'var(--color-success)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Check size={13} color="white" strokeWidth={3} />
            </div>
            <span
              style={{
                fontSize: '0.8125rem',
                color: 'var(--color-success)',
                fontWeight: 600,
              }}
            >
              Logged & structured — you're good!
            </span>
          </div>
        )}
      </form>
    </div>
  );
}
