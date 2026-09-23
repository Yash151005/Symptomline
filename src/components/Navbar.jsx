import { NavLink } from 'react-router-dom';
import { PenLine, Activity, FileText, LogOut } from 'lucide-react';

const navItems = [
  { to: '/', icon: PenLine, label: 'Log' },
  { to: '/timeline', icon: Activity, label: 'Timeline' },
  { to: '/report', icon: FileText, label: 'Report' },
];

export default function Navbar({ onLogout, userName }) {
  return (
    <>
      {/* Desktop top bar */}
      <header
        className="glass-strong"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          padding: '0 24px',
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 64,
          }}
        >
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              className="animate-pop-in"
              style={{
                width: 36,
                height: 36,
                borderRadius: 'var(--radius-sm)',
                background: 'var(--gradient-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: 'var(--shadow-accent)',
              }}
            >
              <PenLine size={17} color="white" />
            </div>
            <span
              style={{
                fontSize: '1.2rem',
                fontWeight: 800,
                letterSpacing: '-0.03em',
                background: 'var(--gradient-primary)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Noted.
            </span>
          </div>

          {/* Desktop nav */}
          <nav
            style={{ display: 'flex', gap: 4 }}
            className="desktop-nav"
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  style={({ isActive }) => ({
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    padding: '8px 18px',
                    borderRadius: 'var(--radius-full)',
                    fontSize: '0.875rem',
                    fontWeight: isActive ? 600 : 500,
                    textDecoration: 'none',
                    color: isActive ? 'white' : 'var(--color-text-secondary)',
                    background: isActive ? 'var(--gradient-primary)' : 'transparent',
                    boxShadow: isActive ? 'var(--shadow-accent)' : 'none',
                    transition: 'all var(--transition-normal)',
                  })}
                >
                  <Icon size={16} />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>

          {/* User area */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {userName && (
              <span
                style={{
                  fontSize: '0.8125rem',
                  color: 'var(--color-text-muted)',
                  fontWeight: 500,
                }}
                className="desktop-nav"
              >
                Hey, {userName} 👋
              </span>
            )}
            {onLogout && (
              <button
                className="btn-ghost"
                onClick={onLogout}
                style={{ padding: 8, borderRadius: 'var(--radius-full)' }}
                title="Sign out"
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile bottom nav */}
      <nav
        className="mobile-nav glass-strong"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          display: 'none',
          borderTop: '1px solid var(--color-border)',
          padding: '6px 0 env(safe-area-inset-bottom, 6px)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-around',
            maxWidth: 400,
            margin: '0 auto',
          }}
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                style={({ isActive }) => ({
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                  padding: '8px 20px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.6875rem',
                  fontWeight: isActive ? 700 : 500,
                  textDecoration: 'none',
                  color: isActive ? 'var(--color-accent)' : 'var(--color-text-muted)',
                  background: isActive ? 'var(--color-accent-bg)' : 'transparent',
                  transition: 'all var(--transition-fast)',
                })}
              >
                <Icon size={20} />
                {item.label}
              </NavLink>
            );
          })}
        </div>
      </nav>

      <style>{`
        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
          .mobile-nav { display: block !important; }
        }
      `}</style>
    </>
  );
}
