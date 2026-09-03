import { useState } from 'react';
import { ActionIcon, Accordion, Badge, Card, Group, Image, Stack, Text, Tooltip } from '@mantine/core';
import { IconMovie, IconSquareX } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { ConfirmModal } from '@swvn-dispatch/dispatch-ui-kit';
import { stopVodClient, vodLogoUrl } from '../api.js';
import { formatDuration } from '../utils/catchupPlayback.js';

export default function VodConnectionCard({ content, connection, onChanged }) {
  const [confirm, setConfirm] = useState(null);
  const profile = connection.m3u_profile || {};

  async function stop() {
    try {
      await stopVodClient(connection.client_id);
      notifications.show({ message: 'VOD connection stopped', color: 'green' });
      onChanged?.();
    } catch (err) {
      notifications.show({ message: err.message, color: 'red' });
    }
  }

  return (
    <Card withBorder radius="md" padding="md">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
          <Image src={vodLogoUrl(content.content_type, content.content_uuid)} alt="" h={48} w={34} fit="contain" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
          <div style={{ minWidth: 0 }}>
            <Text fw={600} truncate>{content.content_name || 'Unknown VOD'}</Text>
            <Badge size="xs" variant="light" color="violet" leftSection={<IconMovie size={11} />}>
              {content.content_type === 'episode' ? 'Episode' : 'Movie'}
            </Badge>
          </div>
        </Group>
        <Tooltip label="Stop VOD connection">
          <ActionIcon color="red" variant="subtle" onClick={() => setConfirm({ title: 'Stop VOD Connection', message: `Stop playback for ${content.content_name || 'this content'}?`, confirmLabel: 'Stop', color: 'red', onConfirm: stop })}>
            <IconSquareX size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>
      <Stack gap={4} mt="sm">
        <Text size="sm" c="dimmed">{connection.ip_address || connection.client_ip || 'Unknown IP'} · {connection.username || 'Anonymous'}</Text>
        {profile.profile_name && <Text size="xs" c="dimmed">M3U Profile: {profile.profile_name}</Text>}
        <Text size="xs" c="dimmed">Connected {formatDuration(connection.duration)} · {((connection.bytes_sent || 0) / (1024 * 1024)).toFixed(1)} MB sent</Text>
      </Stack>
      <Accordion mt="sm" styles={{ item: { borderBottom: 'none' } }}>
        <Accordion.Item value="details">
          <Accordion.Control>Viewer details</Accordion.Control>
          <Accordion.Panel><Text size="xs" c="dimmed">{connection.user_agent || 'Unknown user agent'}</Text></Accordion.Panel>
        </Accordion.Item>
      </Accordion>
      <ConfirmModal action={confirm} onClose={() => setConfirm(null)} />
    </Card>
  );
}
