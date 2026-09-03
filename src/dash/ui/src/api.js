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

export function mediaConnections() {
  return request('/media-connections');
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

export function stopVodClient(clientId) {
  return request(`/vod/clients/${clientId}/stop`, { method: 'POST' });
}

export function stopCatchupSession(sessionId) {
  return request(`/catchup/sessions/${sessionId}/stop`, { method: 'POST' });
}

export function catchupProgrammes(sessions) {
  return request('/catchup/programmes', {
    method: 'POST',
    body: JSON.stringify({ sessions }),
  });
}

export function channelLogoUrl(channelId) {
  return `${BASE}api/channels/${channelId}/logo`;
}

export function vodLogoUrl(contentType, contentId) {
  return `${BASE}api/vod/${contentType}/${contentId}/logo`;
}
