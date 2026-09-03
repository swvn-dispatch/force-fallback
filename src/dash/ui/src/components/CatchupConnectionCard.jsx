import { useState } from 'react';
import { ActionIcon, Accordion, Badge, Card, Group, Image, Stack, Text, Tooltip } from '@mantine/core';
import { IconHistory, IconSquareX } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { ConfirmModal } from '@swvn-dispatch/dispatch-ui-kit';
import { channelLogoUrl, stopCatchupSession } from '../api.js';
import { StreamStatsBadges } from './SessionCard.jsx';
import { formatDuration } from '../utils/catchupPlayback.js';
import CatchupProgramPreview from './CatchupProgramPreview.jsx';

export default function CatchupConnectionCard({ session, connection, programme, onChanged }) {
  const [confirm, setConfirm] = useState(null);
  const profile = connection.m3u_profile || {};

  async function stop() {
    try {
      await stopCatchupSession(connection.session_id || connection.client_id);
      notifications.show({ message: 'Catch-up session stopped', color: 'green' });
      onChanged?.();
    } catch (err) {
      notifications.show({ message: err.message, color: 'red' });
    }
  }

  return (
    <Card withBorder radius="md" padding="md">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
          <Image src={channelLogoUrl(session.channel_uuid)} alt="" h={32} w={32} fit="contain" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
          <div style={{ minWidth: 0 }}>
            <Text fw={600} truncate>{session.channel_name || 'Catch-up'}</Text>
            <Badge size="xs" variant="light" color="cyan" leftSection={<IconHistory size={11} />}>Catch-up</Badge>
          </div>
        </Group>
        <Tooltip label="Stop catch-up session">
          <ActionIcon color="red" variant="subtle" onClick={() => setConfirm({ title: 'Stop Catch-up Session', message: `Stop catch-up playback for ${session.channel_name || 'this channel'}?`, confirmLabel: 'Stop', color: 'red', onConfirm: stop })}>
            <IconSquareX size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>
      <Stack gap={6} mt="sm">
        <CatchupProgramPreview session={session} programme={programme} />
        <StreamStatsBadges stats={session} size="xs" />
        <Text size="sm" c="dimmed">{connection.ip_address || 'Unknown IP'} · {connection.username || 'Anonymous'}</Text>
        {profile.profile_name && <Text size="xs" c="dimmed">M3U Profile: {profile.profile_name}</Text>}
        <Text size="xs" c="dimmed">Connected {formatDuration(connection.duration)} · {((connection.bytes_streamed || 0) / (1024 * 1024)).toFixed(1)} MB sent</Text>
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
