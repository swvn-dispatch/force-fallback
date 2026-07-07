import { useCallback, useEffect, useState } from 'react';
import { Container, Group, Title, SimpleGrid, Center, Loader, Text, ActionIcon, Tooltip } from '@mantine/core';
import { RefreshCw, LogOut } from 'lucide-react';
import { listSessions } from '../api.js';
import SessionCard from './SessionCard.jsx';

const POLL_MS = 5000;

export default function SessionsList({ onLoggedOut }) {
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const data = await listSessions();
      setSessions(data.sessions);
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

  return (
    <Container size="lg" py="md">
      <Group justify="space-between" mb="md">
        <Title order={2}>Active Sessions</Title>
        <Group gap="xs">
          <Tooltip label="Refresh now">
            <ActionIcon variant="subtle" onClick={refresh} aria-label="Refresh">
              <RefreshCw size={18} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Log out">
            <ActionIcon variant="subtle" onClick={onLoggedOut} aria-label="Log out">
              <LogOut size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {error && (
        <Text c="red" mb="md">
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
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          {sessions.map((s) => (
            <SessionCard key={s.channel_id} session={s} onChanged={refresh} />
          ))}
        </SimpleGrid>
      )}
    </Container>
  );
}
