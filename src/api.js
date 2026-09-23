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
};

// Entries
export const entries = {
  list: () => request('/entries'),
  create: (raw_text, timestamp) => request('/entries', { method: 'POST', body: JSON.stringify({ raw_text, timestamp }) }),
  update: (id, data) => request(`/entries/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/entries/${id}`, { method: 'DELETE' }),
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
};

// Reports
export const reports = {
  downloadPdf: async (specialty) => {
    const token = getToken();
    const fileName = `noted-report-${specialty}-${new Date().toISOString().split('T')[0]}.pdf`;

    const res = await fetch(`${API_BASE}/report/${specialty}/pdf?token=${encodeURIComponent(token)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to download PDF (${res.status})`);
    }

    const arrayBuffer = await res.arrayBuffer();
    const pdfBlob = new Blob([arrayBuffer], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(pdfBlob);

    const link = document.createElement('a');
    link.style.display = 'none';
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
      window.URL.revokeObjectURL(url);
    }, 3000);
  },
};
