import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import LogPage from './pages/LogPage';
import TimelinePage from './pages/TimelinePage';
import ReportPage from './pages/ReportPage';
import AuthPage from './pages/AuthPage';

export default function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('noted_user');
    return saved ? JSON.parse(saved) : null;
  });

  const handleAuth = (data) => {
    const userData = { ...data.user, token: data.token };
    setUser(userData);
    localStorage.setItem('noted_user', JSON.stringify(userData));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('noted_user');
  };

  if (!user) {
    return <AuthPage onAuth={handleAuth} />;
  }

  return (
    <BrowserRouter>
      <Navbar onLogout={handleLogout} userName={user.name} />
      <main style={{ flex: 1 }}>
        <Routes>
          <Route path="/" element={<LogPage />} />
          <Route path="/timeline" element={<TimelinePage />} />
          <Route path="/report" element={<ReportPage />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
