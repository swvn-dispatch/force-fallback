import { useEffect, useState } from 'react';
import { Card, Group, Text, Badge, Select, Accordion, Stack, ActionIcon, Tooltip, Loader, Center } from '@mantine/core';
import { UserX } from 'lucide-react';
import { notifications } from '@mantine/notifications';
import { channelStreams, switchSource, disconnectClient, sessionDetail } from '../api.js';

function formatUptime(seconds) {
  if (seconds == null) return '—';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m ${sec}s`;
}

const STATE_COLORS = {
  active: 'green',
  buffering: 'yellow',
  connecting: 'yellow',
  initializing: 'yellow',
  waiting_for_clients: 'blue',
  error: 'red',
  stopped: 'gray',
  stopping: 'gray',
};

export default function SessionCard({ session, onChanged }) {
  const [streams, setStreams] = useState(null);
  const [currentStreamId, setCurrentStreamId] = useState(
    session.stream_id != null ? String(session.stream_id) : null,
  );
  const [switching, setSwitching] = useState(false);
  const [clients, setClients] = useState(session.clients || []);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    let cancelled = false;
    channelStreams(session.channel_id)
      .then((data) => {
        if (cancelled) return;
        setStreams(data.streams);
        if (data.current_stream_id != null) setCurrentStreamId(String(data.current_stream_id));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [session.channel_id]);

  async function handleSwitch(value) {
    if (!value || value === currentStreamId) return;
    setSwitching(true);
    try {
      await switchSource(session.channel_id, Number(value));
      setCurrentStreamId(value);
      notifications.show({ message: 'Source switched', color: 'green' });
      onChanged?.();
    } catch (err) {
      notifications.show({ message: err.message, color: 'red' });
    } finally {
      setSwitching(false);
    }
  }

  async function loadClients() {
    setClientsLoading(true);
    try {
      const detail = await sessionDetail(session.channel_id);
      setClients(detail.clients || []);
    } catch {
      // keep whatever we already have
    } finally {
      setClientsLoading(false);
    }
  }

  async function handleDisconnect(clientId) {
    try {
      await disconnectClient(session.channel_id, clientId);
      setClients((cs) => cs.filter((c) => c.client_id !== clientId));
      notifications.show({ message: 'Client disconnected', color: 'green' });
    } catch (err) {
      notifications.show({ message: err.message, color: 'red' });
    }
  }

  const name = session.channel_name || `Channel ${session.channel_id}`;
  const stateColor = STATE_COLORS[session.state] || 'gray';

  return (
    <Card withBorder radius="md" padding="md">
      <Group justify="space-between" mb="xs" wrap="nowrap">
        <Text fw={600} truncate>
          {name}
        </Text>
        <Badge color={stateColor} variant="light">
          {session.state || 'unknown'}
        </Badge>
      </Group>

      <Stack gap={4} mb="sm">
        <Group gap="xs" justify="space-between">
          <Text size="sm" c="dimmed">
            Uptime
          </Text>
          <Text size="sm">{formatUptime(session.uptime)}</Text>
        </Group>
        <Group gap="xs" justify="space-between">
          <Text size="sm" c="dimmed">
            Bitrate
          </Text>
          <Text size="sm">{session.avg_bitrate || '—'}</Text>
        </Group>
        <Group gap="xs" justify="space-between">
          <Text size="sm" c="dimmed">
            Resolution
          </Text>
          <Text size="sm">
            {session.resolution || '—'}
            {session.video_codec ? ` (${session.video_codec})` : ''}
          </Text>
        </Group>
        <Group gap="xs" justify="space-between">
          <Text size="sm" c="dimmed">
            Clients
          </Text>
          <Text size="sm">{session.client_count ?? 0}</Text>
        </Group>
      </Stack>

      <Select
        label="Source"
        placeholder={streams === null ? 'Loading…' : 'Select a source'}
        data={(streams || []).map((s) => ({ value: String(s.id), label: s.name }))}
        value={currentStreamId}
        onChange={handleSwitch}
        disabled={switching || streams === null}
        searchable
        mb="sm"
      />

      <Accordion
        value={expanded}
        onChange={(value) => {
          setExpanded(value);
          if (value) loadClients();
        }}
      >
        <Accordion.Item value="clients">
          <Accordion.Control>Connected clients ({session.client_count ?? clients.length})</Accordion.Control>
          <Accordion.Panel>
            {clientsLoading ? (
              <Center py="sm">
                <Loader size="sm" />
              </Center>
            ) : clients.length === 0 ? (
              <Text size="sm" c="dimmed">
                No connected clients
              </Text>
            ) : (
              <Stack gap="xs">
                {clients.map((c) => (
                  <Group key={c.client_id} justify="space-between" wrap="nowrap">
                    <div style={{ minWidth: 0 }}>
                      <Text size="sm" truncate>
                        {c.ip_address || 'unknown'}
                      </Text>
                      <Text size="xs" c="dimmed" truncate>
                        {c.user_agent || 'unknown'}
                      </Text>
                    </div>
                    <Tooltip label="Disconnect">
                      <ActionIcon color="red" variant="subtle" onClick={() => handleDisconnect(c.client_id)}>
                        <UserX size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                ))}
              </Stack>
            )}
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Card>
  );
}
