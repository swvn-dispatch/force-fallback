import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell, Stack, Text, SimpleGrid, Center, Loader } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { AppHeader } from '@swvn-dispatch/dispatch-ui-kit';
import logoUrl from '/logo.png';
import { catchupProgrammes, getUsername, listSessions, mediaConnections } from '../api.js';
import SessionCard from './SessionCard.jsx';
import VodConnectionCard from './VodConnectionCard.jsx';
import CatchupConnectionCard from './CatchupConnectionCard.jsx';
import { programmeRequest } from '../utils/catchupPlayback.js';

const POLL_MS = 5000;

export default function SessionsList({ onLoggedOut }) {
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [vod, setVod] = useState([]);
  const [catchup, setCatchup] = useState([]);
  const [programmes, setProgrammes] = useState({});
  const programmesRef = useRef({});

  const refresh = useCallback(async () => {
    try {
      const [liveResult, mediaResult] = await Promise.allSettled([listSessions(), mediaConnections()]);
      if (liveResult.status === 'rejected') throw liveResult.reason;

      const sorted = [...liveResult.value.sessions].sort(
        (a, b) => (a.started_at ?? Infinity) - (b.started_at ?? Infinity),
      );
      setSessions(sorted);
      if (mediaResult.status === 'fulfilled') {
        const media = mediaResult.value;
        const nextCatchup = media.timeshift_sessions || [];
        setVod(media.vod_connections || []);
        setCatchup(nextCatchup);
        if (nextCatchup.length > 0) {
          const data = await catchupProgrammes(
            nextCatchup.map((session) => programmeRequest(session, programmesRef.current[session.session_id])),
          );
          const bySession = Object.fromEntries(
            (data.sessions || []).map((programme) => [programme.session_id, programme]),
          );
          programmesRef.current = bySession;
          setProgrammes(bySession);
        } else {
          programmesRef.current = {};
          setProgrammes({});
        }
      } else {
        throw mediaResult.reason;
      }
      setError(null);
    } catch (err) {
      setError(err.message);
      if (err.message.includes('expired')) onLoggedOut();
    }
  }, [onLoggedOut]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  async function handleManualRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  const cards = [
    ...(sessions || []).map((session) => ({
      id: `live-${session.channel_id}`,
      startedAt: session.started_at || 0,
      node: <SessionCard session={session} onChanged={refresh} />,
    })),
    ...vod.flatMap((content) => (content.connections || []).map((connection) => ({
      id: `vod-${connection.client_id}`,
      startedAt: Number(connection.connected_at) || 0,
      node: <VodConnectionCard content={content} connection={connection} onChanged={refresh} />,
    }))),
    ...catchup.flatMap((session) => (session.connections || []).map((connection) => ({
      id: `catchup-${connection.client_id}`,
      startedAt: Number(connection.connected_at) || 0,
      node: <CatchupConnectionCard session={session} connection={connection} programme={programmes[session.session_id]} onChanged={refresh} />,
    }))),
  ].sort((a, b) => b.startedAt - a.startedAt);

  return (
    <AppShell header={{ height: 56 }}>
      <AppHeader
        logoUrl={logoUrl}
        appName="Source Switch"
        version={__APP_VERSION__}
        githubUrl="https://github.com/swvn-dispatch/source-switch"
        username={getUsername()}
        onLogout={onLoggedOut}
        actions={[
          { key: 'refresh', label: 'Refresh', icon: IconRefresh, onClick: handleManualRefresh, loading: refreshing },
        ]}
      />

      <AppShell.Main>
        <Stack p="md" maw={860} mx="auto">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            Active Connections
          </Text>

          {error && (
            <Text c="red" size="sm">
              {error}
            </Text>
          )}

          {sessions === null ? (
            <Center py="xl">
              <Loader />
            </Center>
          ) : cards.length === 0 ? (
            <Text c="dimmed" ta="center" py="xl">
              No active connections
            </Text>
          ) : (
            <>
              <Text size="xs" c="dimmed">
                {sessions.length} live, {vod.reduce((count, item) => count + (item.connections?.length || 0), 0)} VOD, {catchup.reduce((count, item) => count + (item.connections?.length || 0), 0)} catch-up
              </Text>
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                {cards.map((card) => <div key={card.id}>{card.node}</div>)}
              </SimpleGrid>
            </>
          )}
        </Stack>
      </AppShell.Main>
    </AppShell>
  );
}
