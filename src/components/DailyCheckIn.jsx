import { useEffect, useState } from 'react';
import { ClipboardCheck, Moon, Brain, Coffee, Wine, Dumbbell, Monitor, Check, Plus, Loader2 } from 'lucide-react';
import { checkins as checkinsApi, analytics, localDateKey } from '../api';

const COMMON_FACTORS = ['skipped_meal', 'dehydration', 'bright_lights', 'weather_change', 'late_dinner', 'spicy', 'dairy', 'menstruation', 'travel'];

const EMPTY = {
  sleep_hours: '', sleep_quality: null, stress: null, caffeine_cups: 0, alcohol_units: 0,
  exercise_minutes: '', screen_hours: '', tags: [], symptom_free: false,
};

function Scale({ value, onChange, labels }) {
  return (
    <div style={{ display: 'flex', gap: 6 }} role="radiogroup">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          title={labels?.[n - 1]}
          onClick={() => onChange(value === n ? null : n)}
          className={value === n ? 'btn-primary' : 'btn-secondary'}
          style={{ width: 34, height: 34, padding: 0, fontSize: '0.8125rem', borderRadius: 'var(--radius-sm)' }}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function Stepper({ value, onChange, max = 20 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button type="button" className="btn-secondary" style={{ width: 30, height: 30, padding: 0 }} onClick={() => onChange(Math.max(0, value - 1))} aria-label="decrease">−</button>
      <span style={{ minWidth: 18, textAlign: 'center', fontWeight: 700 }}>{value}</span>
      <button type="button" className="btn-secondary" style={{ width: 30, height: 30, padding: 0 }} onClick={() => onChange(Math.min(max, value + 1))} aria-label="increase">+</button>
    </div>
  );
}

function Field({ icon: Icon, label, hint, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>
        <Icon size={13} style={{ color: 'var(--color-accent)' }} />
        {label}
        {hint && <span style={{ fontWeight: 500, color: 'var(--color-text-muted)' }}>{hint}</span>}
      </label>
      {children}
    </div>
  );
}

/**
 * Daily check-in: records exposures on every day (including symptom-free
 * days) so the trigger engine can compare symptom days with other days.
 */
export default function DailyCheckIn({ onSaved }) {
  const today = localDateKey();
  const [form, setForm] = useState(EMPTY);
  const [saved, setSaved] = useState(null);
  const [editing, setEditing] = useState(false);
  const [progress, setProgress] = useState(null);
  const [customTag, setCustomTag] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([checkinsApi.get(today), analytics.triggers()])
      .then(([existing, triggers]) => {
        if (cancelled) return;
        setProgress(triggers);
        if (existing) {
          setSaved(existing);
          setForm({ ...EMPTY, ...Object.fromEntries(Object.entries(existing).map(([k, v]) => [k, v ?? EMPTY[k]])) });
        } else {
          setEditing(true);
        }
      })
      .catch(() => !cancelled && setUnavailable(true));
    return () => { cancelled = true; };
  }, [today]);

  if (unavailable) return null;

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const toggleTag = (tag) => setForm((f) => ({ ...f, tags: f.tags.includes(tag) ? f.tags.filter((t) => t !== tag) : [...f.tags, tag] }));

  const addCustomTag = () => {
    const tag = customTag.trim().toLowerCase().replace(/\s+/g, '_');
    if (tag && !form.tags.includes(tag)) setForm((f) => ({ ...f, tags: [...f.tags, tag] }));
    setCustomTag('');
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await checkinsApi.save(today, form);
      setSaved(result);
      setEditing(false);
      setProgress(await analytics.triggers());
      onSaved?.(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const observed = progress?.observedDays ?? 0;
  const minDays = progress?.minDays ?? 14;
  const pctReady = Math.min(100, Math.round((observed / minDays) * 100));

  const progressLine = (
    progress && (progress.ready ? (
      <span style={{ fontSize: '0.75rem', color: 'var(--color-success)', fontWeight: 600 }}>
        {observed} days checked in · trigger analysis active · {progress.findingCount} significant trigger{progress.findingCount === 1 ? '' : 's'}
      </span>
    ) : (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 200 }}>
        <div className="progress-bar" style={{ flex: 1 }}>
          <div className="progress-bar-fill" style={{ width: `${pctReady}%` }} />
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>
          {observed}/{minDays} days to unlock trigger analysis
        </span>
      </div>
    ))
  );

  if (saved && !editing) {
    return (
      <div className="card-static" style={{ padding: '16px 20px', marginTop: 20, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--color-success)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Check size={16} color="white" strokeWidth={3} />
        </div>
        <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>Today&apos;s check-in done</div>
        {progressLine}
        <button className="btn-ghost" style={{ fontSize: '0.75rem' }} onClick={() => setEditing(true)}>Edit</button>
      </div>
    );
  }

  return (
    <form className="card-static animate-fade-in" onSubmit={submit} style={{ padding: '22px 24px', marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
        <ClipboardCheck size={18} style={{ color: 'var(--color-accent)' }} />
        <h3 style={{ fontSize: '1rem', fontWeight: 800 }}>Daily check-in</h3>
        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>30 seconds, even on good days</span>
      </div>
      <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: 18, lineHeight: 1.5 }}>
        Triggers can only be identified by comparing days you had symptoms with days you didn&apos;t, so symptom-free check-ins matter most.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18, marginBottom: 18 }}>
        <Field icon={Moon} label="Sleep last night">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input className="input" type="number" min="0" max="24" step="0.5" placeholder="hrs" value={form.sleep_hours}
              onChange={(e) => set('sleep_hours')(e.target.value)} style={{ width: 76, height: 34, padding: '0 10px' }} aria-label="Hours slept" />
            <Scale value={form.sleep_quality} onChange={set('sleep_quality')} labels={['Very poor', 'Poor', 'OK', 'Good', 'Great']} />
          </div>
        </Field>
        <Field icon={Brain} label="Stress" hint="1 calm · 5 very stressed">
          <Scale value={form.stress} onChange={set('stress')} />
        </Field>
        <Field icon={Coffee} label="Caffeine" hint="cups">
          <Stepper value={form.caffeine_cups} onChange={set('caffeine_cups')} />
        </Field>
        <Field icon={Wine} label="Alcohol" hint="drinks">
          <Stepper value={form.alcohol_units} onChange={set('alcohol_units')} />
        </Field>
        <Field icon={Dumbbell} label="Exercise" hint="minutes">
          <input className="input" type="number" min="0" max="1440" step="5" placeholder="0" value={form.exercise_minutes}
            onChange={(e) => set('exercise_minutes')(e.target.value)} style={{ width: 100, height: 34, padding: '0 10px' }} />
        </Field>
        <Field icon={Monitor} label="Screen time" hint="hours">
          <input className="input" type="number" min="0" max="24" step="0.5" placeholder="0" value={form.screen_hours}
            onChange={(e) => set('screen_hours')(e.target.value)} style={{ width: 100, height: 34, padding: '0 10px' }} />
        </Field>
      </div>

      <Field icon={Plus} label="Anything else today?">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {[...new Set([...COMMON_FACTORS, ...form.tags])].map((tag) => (
            <button key={tag} type="button" onClick={() => toggleTag(tag)}
              className={`tag ${form.tags.includes(tag) ? 'tag-accent' : 'tag-neutral'}`}
              style={{ cursor: 'pointer', border: 'none', fontWeight: form.tags.includes(tag) ? 700 : 500 }}
              aria-pressed={form.tags.includes(tag)}>
              {tag.replace(/_/g, ' ')}
            </button>
          ))}
          <input className="input" value={customTag} onChange={(e) => setCustomTag(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomTag(); } }}
            placeholder="add your own…" style={{ width: 140, height: 28, padding: '0 10px', fontSize: '0.75rem' }} />
        </div>
      </Field>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 18, fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer' }}>
        <input type="checkbox" checked={form.symptom_free} onChange={(e) => set('symptom_free')(e.target.checked)} />
        No symptoms today
      </label>

      {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.8125rem', marginTop: 12 }}>{error}</p>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 18, flexWrap: 'wrap' }}>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> : 'Save check-in'}
        </button>
        {saved && <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>}
        {progressLine}
      </div>
    </form>
  );
}
