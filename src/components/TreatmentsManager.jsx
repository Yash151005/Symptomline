import { useState, useEffect } from 'react';
import { Pill, Plus, X, Save, Trash2 } from 'lucide-react';
import { treatments as treatmentsApi } from '../api';
import { format } from 'date-fns';

export default function TreatmentsManager() {
  const [treatments, setTreatments] = useState([]);
  const [isAdding, setIsAdding] = useState(false);
  const [loading, setLoading] = useState(true);

  // Form state
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadTreatments();
  }, []);

  async function loadTreatments() {
    try {
      const data = await treatmentsApi.list();
      setTreatments(data);
    } catch (err) {
      console.error('Failed to load treatments', err);
    } finally {
      setLoading(false);
    }
  }

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      const newTreatment = await treatmentsApi.create({
        name,
        start_date: new Date(startDate).toISOString(),
        end_date: endDate ? new Date(endDate).toISOString() : null,
        notes,
      });
      setTreatments([newTreatment, ...treatments]);
      setIsAdding(false);
      setName('');
      setEndDate('');
      setNotes('');
    } catch (err) {
      console.error('Failed to add treatment', err);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Remove this treatment?')) return;
    try {
      await treatmentsApi.delete(id);
      setTreatments(treatments.filter((t) => t.id !== id));
    } catch (err) {
      console.error('Failed to delete', err);
    }
  };

  if (loading) return null;

  return (
    <div className="card-static" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Pill size={18} color="var(--color-accent)" />
          Active Treatments
        </h3>
        {!isAdding && (
          <button className="btn-ghost" onClick={() => setIsAdding(true)} style={{ color: 'var(--color-accent)' }}>
            <Plus size={16} /> Add
          </button>
        )}
      </div>

      {isAdding && (
        <form
          onSubmit={handleSave}
          className="animate-slide-down"
          style={{
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            padding: 16, borderRadius: 'var(--radius-md)', marginBottom: 20
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Treatment Name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Magnesium Supplement" />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Start Date</label>
                <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>End Date (Optional)</label>
                <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Notes</label>
              <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Dosage, frequency, etc." />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button type="button" className="btn-secondary" onClick={() => setIsAdding(false)} style={{ flex: 1 }}>Cancel</button>
              <button type="submit" className="btn-primary" style={{ flex: 1 }}>
                <Save size={15} /> Save
              </button>
            </div>
          </div>
        </form>
      )}

      {treatments.length === 0 && !isAdding ? (
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', textAlign: 'center', padding: '20px 0' }}>
          No active treatments logged.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {treatments.map((t) => (
            <div key={t.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              padding: '14px 16px', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border-subtle)', borderLeft: '3px solid var(--color-accent)'
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9375rem', marginBottom: 4 }}>{t.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: 4 }}>
                  Started {format(new Date(t.start_date), 'MMM d, yyyy')}
                  {t.end_date && ` • Ended ${format(new Date(t.end_date), 'MMM d, yyyy')}`}
                </div>
                {t.notes && <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>{t.notes}</div>}
              </div>
              <button className="btn-ghost" onClick={() => handleDelete(t.id)} style={{ color: 'var(--color-danger)' }}>
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
