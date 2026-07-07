// window.__BASE_PATH__ is injected by the Python server into index.html at
// request time (see dash/api.py::serve_static), reflecting the currently
// configured dash_path. Falls back to '/' for local `npm run dev`.
const BASE = (typeof window !== 'undefined' && window.__BASE_PATH__) || '/';

const TOKEN_KEY = 'ff_access_token';

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}api${path}`, { ...options, headers });

  if (res.status === 401) {
    setToken(null);
    throw new Error('Session expired, please log in again');
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      message = data.error || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function login(username, password) {
  const data = await request('/auth/token', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  setToken(data.access);
  return data;
}

export function logout() {
  setToken(null);
}

export function isAuthenticated() {
  return !!getToken();
}

export function listSessions() {
  return request('/sessions');
}

export function sessionDetail(channelId) {
  return request(`/sessions/${channelId}`);
}

export function channelStreams(channelId) {
  return request(`/channels/${channelId}/streams`);
}

export function switchSource(channelId, streamId) {
  return request(`/channels/${channelId}/switch`, {
    method: 'POST',
    body: JSON.stringify({ stream_id: streamId }),
  });
}

export function disconnectClient(channelId, clientId) {
  return request(`/channels/${channelId}/clients/${clientId}/disconnect`, {
    method: 'POST',
  });
}

export function stopChannel(channelId) {
  return request(`/channels/${channelId}/stop`, {
    method: 'POST',
  });
}

export function channelLogoUrl(channelId) {
  return `${BASE}api/channels/${channelId}/logo`;
}
