import { useState } from 'react';
import { PenLine, Mail, Lock, User, ArrowRight, Loader2, Sparkles } from 'lucide-react';

export default function AuthPage({ onAuth }) {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      const body = isLogin ? { email, password } : { name, email, password };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      onAuth(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      {/* Background orbs */}
      <div className="orb orb-purple" style={{ width: 400, height: 400, top: -100, right: -100 }} />
      <div className="orb orb-pink" style={{ width: 300, height: 300, bottom: -50, left: -80 }} />
      <div className="orb orb-blue" style={{ width: 250, height: 250, top: '40%', left: '60%' }} />

      <div className="auth-card">
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div
            className="animate-bounce-in"
            style={{
              width: 56,
              height: 56,
              borderRadius: 'var(--radius-md)',
              background: 'var(--gradient-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              boxShadow: 'var(--shadow-accent-lg)',
            }}
          >
            <PenLine size={26} color="white" />
          </div>
          <h1
            style={{
              fontSize: '1.75rem',
              fontWeight: 800,
              letterSpacing: '-0.03em',
              marginBottom: 6,
              background: 'var(--gradient-primary)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Noted.
          </h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', fontWeight: 500 }}>
            {isLogin ? 'Welcome back — let\'s check in.' : 'Start tracking your health journey.'}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div
            className="animate-slide-down"
            style={{
              padding: '10px 16px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-danger-bg)',
              border: '1px solid rgba(255, 107, 107, 0.2)',
              color: 'var(--color-danger)',
              fontSize: '0.8125rem',
              fontWeight: 500,
              marginBottom: 18,
              textAlign: 'center',
            }}
          >
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!isLogin && (
            <div style={{ position: 'relative' }} className="animate-fade-in">
              <User
                size={16}
                style={{
                  position: 'absolute',
                  left: 14,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--color-text-muted)',
                }}
              />
              <input
                className="input"
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required={!isLogin}
                style={{ paddingLeft: 42 }}
              />
            </div>
          )}

          <div style={{ position: 'relative' }}>
            <Mail
              size={16}
              style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--color-text-muted)',
              }}
            />
            <input
              className="input"
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ paddingLeft: 42 }}
            />
          </div>

          <div style={{ position: 'relative' }}>
            <Lock
              size={16}
              style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--color-text-muted)',
              }}
            />
            <input
              className="input"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={4}
              style={{ paddingLeft: 42 }}
            />
          </div>

          <button
            className="btn-primary"
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              height: 50,
              fontSize: '0.9375rem',
              marginTop: 6,
              borderRadius: 'var(--radius-sm)',
            }}
          >
            {loading ? (
              <Loader2 size={20} style={{ animation: 'spin 0.8s linear infinite' }} />
            ) : (
              <>
                {isLogin ? 'Sign In' : 'Create Account'}
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        {/* Toggle */}
        <div style={{ textAlign: 'center', marginTop: 24, fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
          {isLogin ? "Don't have an account?" : 'Already have an account?'}
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-accent)',
              fontWeight: 700,
              cursor: 'pointer',
              marginLeft: 6,
              fontFamily: 'var(--font-sans)',
              fontSize: '0.8125rem',
            }}
          >
            {isLogin ? 'Sign Up' : 'Sign In'}
          </button>
        </div>

        {/* Feature hint */}
        <div
          style={{
            marginTop: 28,
            padding: '14px 16px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-accent-bg)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Sparkles size={16} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
            <strong>AI-powered</strong> — just type how you feel. We extract symptoms, severity, and patterns automatically.
          </span>
        </div>
      </div>
    </div>
  );
}
