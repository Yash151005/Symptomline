import { useEffect, useState } from 'react';
import { Shield, FileJson, HeartPulse, Link2, LogOut, Trash2, Loader2, ShieldCheck } from 'lucide-react';
import { privacy, integrity as integrityApi } from '../api';
import SharePanel from '../components/SharePanel';
import IntegrityBadge from '../components/IntegrityBadge';

function Section({ icon: Icon, title, desc, children, danger }) {
  return (
    <section className="card-static" style={{ padding: 22, marginBottom: 16, borderColor: danger ? '#f5c6cb' : undefined }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, color: danger ? '#c0392b' : undefined }}>
        <Icon size={17} /> {title}
      </h2>
      {desc && <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: 14, lineHeight: 1.5 }}>{desc}</p>}
      {children}
    </section>
  );
}

export default function PrivacyPage({ onSignedOut }) {
  const [integrity, setIntegrity] = useState(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [password, setPassword] = useState('');
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    integrityApi.status().then(setIntegrity).catch(() => {});
  }, []);

  const run = async (key, fn, done) => {
    setBusy(key);
    setMessage('');
    try {
      const r = await fn();
      if (done) setMessage(done(r));
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy('');
    }
  };

  const deleteAccount = async () => {
    setBusy('delete');
    setDeleteError('');
    try {
      await privacy.deleteAccount(password);
      onSignedOut();
    } catch (err) {
      setDeleteError(err.message);
      setBusy('');
    }
  };

  const spinner = <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />;

  return (
    <div className="page-container" style={{ paddingTop: 32, paddingBottom: 100, maxWidth: 760 }}>
      <h1 className="section-title" style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Shield size={22} /> Privacy & Your Data
      </h1>
      <p className="section-subtitle" style={{ fontSize: '0.875rem' }}>
        Your health record belongs to you. Take it anywhere, see who has it, and delete it whenever you want.
      </p>

      {integrity && (
        <Section icon={ShieldCheck} title="Timeline integrity" desc="Every change to your symptom log is chained into a tamper-evident audit ledger, so your doctor can trust the timeline is exactly what you recorded.">
          <IntegrityBadge integrity={integrity} />
        </Section>
      )}

      <Section icon={Link2} title="Who can see your data" desc="Clinician links you have shared. Revoke any of them instantly, and open the access log to see each time a link was used.">
        <SharePanel />
      </Section>

      <Section icon={FileJson} title="Download your data" desc="Take your complete record to another app, doctor or hospital.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          <button className="btn-secondary" onClick={() => run('fhir', privacy.exportFhir)} disabled={!!busy} style={{ justifyContent: 'flex-start', height: 'auto', padding: '12px 14px', textAlign: 'left' }}>
            {busy === 'fhir' ? spinner : <HeartPulse size={16} />}
            <span>
              <strong style={{ display: 'block' }}>HL7 FHIR R4 bundle</strong>
              <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>The standard hospital EHRs import, with SNOMED CT codes</span>
            </span>
          </button>
          <button className="btn-secondary" onClick={() => run('json', privacy.exportJson)} disabled={!!busy} style={{ justifyContent: 'flex-start', height: 'auto', padding: '12px 14px', textAlign: 'left' }}>
            {busy === 'json' ? spinner : <FileJson size={16} />}
            <span>
              <strong style={{ display: 'block' }}>Complete archive (JSON)</strong>
              <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>Entries, check-ins, treatments, audit ledger, share history</span>
            </span>
          </button>
        </div>
      </Section>

      <Section icon={LogOut} title="Sessions" desc="Signed in on a device you no longer have? Sign out everywhere. You will need to log in again here too.">
        <button className="btn-secondary" disabled={!!busy} onClick={() => run('logoutAll', async () => {
          await privacy.logoutAll();
          onSignedOut();
        })}>
          {busy === 'logoutAll' ? spinner : <LogOut size={15} />} Sign out of all devices
        </button>
      </Section>

      {message && <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginBottom: 16 }}>{message}</p>}

      <Section icon={Trash2} title="Delete account" danger desc="Permanently erases your account, every symptom entry, check-in, treatment, audit record and share link. Active links stop working immediately. This cannot be undone. Download your data first if you want a copy.">
        <div style={{ display: 'grid', gap: 10, maxWidth: 360 }}>
          <input className="input" placeholder='Type "DELETE" to confirm' value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
          <input className="input" type="password" placeholder="Your password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button
            className="btn-primary"
            style={{ background: '#c0392b', boxShadow: 'none' }}
            disabled={confirmText !== 'DELETE' || !password || busy === 'delete'}
            onClick={deleteAccount}
          >
            {busy === 'delete' ? spinner : <Trash2 size={15} />} Permanently delete my account
          </button>
          {deleteError && <p style={{ color: '#c0392b', fontSize: '0.75rem' }}>{deleteError}</p>}
        </div>
      </Section>
    </div>
  );
}
