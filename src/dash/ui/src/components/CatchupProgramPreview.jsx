import { useEffect, useState } from 'react';
import { ActionIcon, Group, Progress, Stack, Text, Tooltip } from '@mantine/core';
import { IconChevronDown, IconChevronRight, IconPlayerPause, IconPlayerPlay } from '@tabler/icons-react';
import { formatDuration, playbackSeconds } from '../utils/catchupPlayback.js';

export default function CatchupProgramPreview({ session, programme }) {
  const [expanded, setExpanded] = useState(false);
  const [, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!programme?.title) {
    return (
      <Text size="xs" c="dimmed">
        {session.programme_start ? `Catch-up @ ${session.programme_start}` : 'Catch-up'}
      </Text>
    );
  }

  const duration = Number(programme.duration_secs) || 0;
  const watched = Math.min(duration, playbackSeconds(session, programme) || 0);
  const remaining = Math.max(0, duration - watched);
  const percent = duration > 0 ? (watched / duration) * 100 : 0;
  const aired = programme.start_time && programme.end_time
    ? `${new Date(programme.start_time).toLocaleString()} to ${new Date(programme.end_time).toLocaleTimeString()}`
    : null;

  return (
    <Stack gap={4}>
      <Group gap={5} wrap="nowrap">
        {session.paused ? <IconPlayerPause size={14} /> : <IconPlayerPlay size={14} />}
        <Text size="xs" fw={500} c={session.paused ? 'yellow' : 'green'}>
          {session.paused ? 'Paused:' : 'Watching:'}
        </Text>
        <Tooltip label={programme.title}>
          <Text size="xs" c="dimmed" truncate style={{ flex: 1 }}>
            {programme.title}
          </Text>
        </Tooltip>
        <ActionIcon size="xs" variant="subtle" onClick={() => setExpanded((value) => !value)}>
          {expanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
        </ActionIcon>
      </Group>
      {expanded && (
        <Stack gap={4} ml={20}>
          {programme.description && <Text size="xs" c="dimmed">{programme.description}</Text>}
          {aired && <Text size="xs" c="dimmed">Aired {aired}</Text>}
          {duration > 0 && (
            <>
              <Group justify="space-between">
                <Text size="xs" c="dimmed">{formatDuration(watched)} watched</Text>
                <Text size="xs" c="dimmed">{formatDuration(remaining)} remaining</Text>
              </Group>
              <Progress value={percent} size="sm" color={session.paused ? 'yellow' : 'green'} />
            </>
          )}
        </Stack>
      )}
    </Stack>
  );
}
