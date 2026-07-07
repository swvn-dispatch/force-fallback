import { useCallback, useEffect, useState } from 'react';
import { AppShell, Group, Image, Button, ActionIcon, Stack, Text, SimpleGrid, Center, Loader } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
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
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
            <Image src={logoUrl} h={32} w="auto" />
            <Text size="xs" c="dimmed">
              v{__APP_VERSION__}
            </Text>
          </Group>
          <Group gap="xs" wrap="nowrap">
            <Button size="sm" leftSection={<IconRefresh size={16} />} loading={refreshing} onClick={handleManualRefresh} visibleFrom="xs">
              Refresh
            </Button>
            <ActionIcon size="lg" variant="default" loading={refreshing} hiddenFrom="xs" aria-label="Refresh" onClick={handleManualRefresh}>
              <IconRefresh size={18} />
            </ActionIcon>
            <Button size="sm" variant="subtle" onClick={onLoggedOut}>
              Logout
            </Button>
          </Group>
        </Group>
      </AppShell.Header>

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
