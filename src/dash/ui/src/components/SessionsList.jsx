import { useCallback, useEffect, useState } from 'react';
import { AppShell, Stack, Text, SimpleGrid, Center, Loader } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { AppHeader } from '@swvn-dispatch/dispatch-ui-kit';
import logoUrl from '/logo.png';
import { listSessions } from '../api.js';
import SessionCard from './SessionCard.jsx';

const POLL_MS = 5000;

export default function SessionsList({ onLoggedOut }) {
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await listSessions();
      const sorted = [...data.sessions].sort(
        (a, b) => (a.started_at ?? Infinity) - (b.started_at ?? Infinity),
      );
      setSessions(sorted);
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

  return (
    <AppShell header={{ height: 56 }}>
      <AppHeader
        logoUrl={logoUrl}
        version={__APP_VERSION__}
        onLogout={onLoggedOut}
        actions={[
          { key: 'refresh', label: 'Refresh', icon: IconRefresh, onClick: handleManualRefresh, loading: refreshing },
        ]}
      />

      <AppShell.Main>
        <Stack p="md" maw={860} mx="auto">
          <Text size="xs" tt="uppercase" fw={700} c="dimmed">
            Active Sessions
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
          ) : sessions.length === 0 ? (
            <Text c="dimmed" ta="center" py="xl">
              No active stream sessions
            </Text>
          ) : (
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              {sessions.map((s) => (
                <SessionCard key={s.channel_id} session={s} onChanged={refresh} />
              ))}
            </SimpleGrid>
          )}
        </Stack>
      </AppShell.Main>
    </AppShell>
  );
}
