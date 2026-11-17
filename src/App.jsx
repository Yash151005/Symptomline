import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import LogPage from './pages/LogPage';
import TimelinePage from './pages/TimelinePage';
import ReportPage from './pages/ReportPage';
import PrivacyPage from './pages/PrivacyPage';
import SharedReportPage from './pages/SharedReportPage';
import AuthPage from './pages/AuthPage';
import { auth } from './api';

// Clinician share links are public (token-scoped) and bypass patient login.
const shareMatch = window.location.pathname.match(/^\/share\/([A-Za-z0-9_-]{20,100})\/?$/);

export default function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('noted_user');
    return saved ? JSON.parse(saved) : null;
  });

  if (shareMatch) {
    return <SharedReportPage token={shareMatch[1]} />;
  }

  const handleAuth = (data) => {
    const userData = { ...data.user, token: data.token };
    setUser(userData);
    localStorage.setItem('noted_user', JSON.stringify(userData));
  };

  // Clears local state; `revoke` also ends the session on the server.
  const handleLogout = (revoke = true) => {
    if (revoke) auth.logout();
    setUser(null);
    localStorage.removeItem('noted_user');
  };

  if (!user) {
    return <AuthPage onAuth={handleAuth} />;
  }

  return (
    <BrowserRouter>
      <Navbar onLogout={() => handleLogout(true)} userName={user.name} />
      <main style={{ flex: 1 }}>
        <Routes>
          <Route path="/" element={<LogPage />} />
          <Route path="/timeline" element={<TimelinePage />} />
          <Route path="/report" element={<ReportPage />} />
          <Route path="/privacy" element={<PrivacyPage onSignedOut={() => handleLogout(false)} />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
