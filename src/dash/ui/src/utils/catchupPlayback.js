export function formatDuration(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const remaining = value % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`
    : `${minutes}:${String(remaining).padStart(2, '0')}`;
}

function parseCatchupTimestamp(timestamp) {
  const match = String(timestamp || '').match(/^(\d{4}-\d{2}-\d{2})[:_ ](\d{2})[-:](\d{2})/);
  return match ? Date.parse(`${match[1]}T${match[2]}:${match[3]}:00Z`) : null;
}

export function playbackSeconds(session, programme, now = Date.now()) {
  const anchor = Number(session.position_anchor_at);
  const elapsed = !session.paused && Number.isFinite(anchor) ? Math.max(0, now / 1000 - anchor) : 0;
  let position = Number(session.playback_base_secs);
  if (!Number.isFinite(position)) {
    const archiveStart = parseCatchupTimestamp(session.programme_start);
    const programmeStart = Date.parse(programme?.start_time);
    if (!Number.isFinite(archiveStart) || !Number.isFinite(programmeStart)) return null;
    position = (archiveStart - programmeStart) / 1000;
  } else if (programme?.start_time) {
    const archiveStart = parseCatchupTimestamp(session.programme_start);
    const programmeStart = Date.parse(programme.start_time);
    if (Number.isFinite(archiveStart) && Number.isFinite(programmeStart) && programmeStart > archiveStart) {
      position -= (programmeStart - archiveStart) / 1000;
    }
  }
  return Math.max(0, position + elapsed);
}

export function programmeRequest(session, programme) {
  const payload = {
    session_id: session.session_id,
    channel_uuid: session.channel_uuid,
    programme_start: session.programme_start,
  };
  const position = playbackSeconds(session, programme);
  if (position != null) payload.position_secs = position;
  return payload;
}
