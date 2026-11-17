const API_BASE = '/api';

function getToken() {
  try {
    const user = JSON.parse(localStorage.getItem('noted_user') || '{}');
    return user.token || '';
  } catch {
    return '';
  }
}

function headers() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getToken()}`,
  };
}

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...headers(), ...options.headers },
  });
  if (res.status === 401) {
    localStorage.removeItem('noted_user');
    window.location.reload();
    throw new Error('Session expired');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed: ${res.status}`);
  }

  // Check if response is PDF
  if (res.headers.get('content-type')?.includes('application/pdf')) {
    return res.blob();
  }
  return res.json();
}

// Auth
export const auth = {
  register: (data) => request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data) => request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  // Best effort: the local session is cleared even if the server is unreachable.
  logout: () => fetch(`${API_BASE}/auth/logout`, { method: 'POST', headers: headers() }).catch(() => {}),
};

// Entries
export const entries = {
  list: () => request('/entries'),
  create: (raw_text, timestamp) => request('/entries', { method: 'POST', body: JSON.stringify({ raw_text, timestamp }) }),
  update: (id, data) => request(`/entries/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/entries/${id}`, { method: 'DELETE' }),
  acknowledgeFlags: (id) => request(`/entries/${id}/acknowledge-flags`, { method: 'POST' }),
};

// Daily check-ins (dates are the patient's local YYYY-MM-DD)
export function localDateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const checkins = {
  list: (days = 30) => request(`/checkins?days=${days}`),
  get: (date) => request(`/checkins/${date}`),
  save: (date, data) => request(`/checkins/${date}`, { method: 'PUT', body: JSON.stringify(data) }),
};

// Treatments
export const treatments = {
  list: () => request('/treatments'),
  create: (data) => request('/treatments', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/treatments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/treatments/${id}`, { method: 'DELETE' }),
};

// Patterns & Analytics
export const analytics = {
  patterns: () => request('/patterns'),
  diff: (symptom, days = 60) => request(`/diff/${encodeURIComponent(symptom)}?days=${days}`),
  questions: (specialty) => request(`/questions/${specialty}`),
  stats: () => request('/stats'),
  triggers: () => request('/triggers'),
};

// Authenticated binary download (PDF / JSON exports). The token travels in the
// Authorization header only — never in the URL, where it would be logged.
async function downloadFile(path, fileName, mime) {
  const res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Download failed (${res.status})`);
  }
  const blob = new Blob([await res.arrayBuffer()], { type: mime });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.style.display = 'none';
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    link.remove();
    window.URL.revokeObjectURL(url);
  }, 3000);
}

const today = () => new Date().toISOString().split('T')[0];

// Reports
export const reports = {
  downloadPdf: (specialty, days = 90) =>
    downloadFile(`/report/${specialty}/pdf?days=${days}`, `noted-report-${specialty}-${today()}.pdf`, 'application/pdf'),
};

// Timeline integrity (tamper-evident ledger)
export const integrity = {
  status: () => request('/integrity'),
  history: (entryId) => request(`/entries/${entryId}/history`),
};

// Clinician share links
export const shares = {
  list: () => request('/shares'),
  create: (data) => request('/shares', { method: 'POST', body: JSON.stringify(data) }),
  revoke: (id) => request(`/shares/${id}`, { method: 'DELETE' }),
  accessLog: (id) => request(`/shares/${id}/access-log`),
};

// Public, token-scoped clinician view. Uses plain fetch: a 401/410 here must
// not log the viewer out of anything.
export const shared = {
  get: async (token) => {
    const res = await fetch(`${API_BASE}/shared/${encodeURIComponent(token)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
    return data;
  },
  pdfUrl: (token) => `${API_BASE}/shared/${encodeURIComponent(token)}/pdf`,
};

// Privacy & data rights
export const privacy = {
  exportJson: () => downloadFile('/export/json', `noted-export-${today()}.json`, 'application/json'),
  exportFhir: () => downloadFile('/export/fhir', `noted-fhir-r4-${today()}.json`, 'application/fhir+json'),
  logoutAll: () => request('/auth/logout-all', { method: 'POST' }),
  deleteAccount: (password) => request('/account', { method: 'DELETE', body: JSON.stringify({ password }) }),
};
