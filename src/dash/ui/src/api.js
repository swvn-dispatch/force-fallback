import { createApiClient } from '@swvn-dispatch/dispatch-ui-kit';

const client = createApiClient({ tokenKey: 'ss_access_token' });

export const login = client.login;
export const logout = client.logout;
export const isAuthenticated = client.isAuthenticated;
export const getUsername = client.getUsername;

const { request, basePath: BASE } = client;

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
