"""Thin wrapper around Dispatcharr's live_proxy internals.

Runs in-process (same Django/gevent worker as Dispatcharr core), so these are
plain Python calls -- no HTTP hop, no extra auth needed to reach them.
"""

import logging
import re

logger = logging.getLogger(__name__)


def _channel_display(channel_uuid: str) -> dict:
    """Best-effort {name, channel_number} for a channel, via ORM lookup."""
    try:
        from apps.channels.models import Channel
        ch = Channel.objects.filter(uuid=channel_uuid).values("name", "channel_number").first()
        if ch:
            return {"channel_name": ch["name"], "channel_number": ch["channel_number"]}
    except Exception:
        pass
    return {}


def _stream_profile_name(stream_profile_id) -> "str | None":
    if not stream_profile_id:
        return None
    try:
        from core.models import StreamProfile
        return StreamProfile.objects.filter(id=int(stream_profile_id)).values_list("name", flat=True).first()
    except Exception:
        return None


def _m3u_profile_name(m3u_profile_id) -> "str | None":
    if not m3u_profile_id:
        return None
    try:
        from apps.m3u.models import M3UAccountProfile
        return M3UAccountProfile.objects.filter(id=int(m3u_profile_id)).values_list("name", flat=True).first()
    except Exception:
        return None


def _provider_name(stream_id) -> "str | None":
    """M3U account ("provider") name that owns the given stream."""
    if not stream_id:
        return None
    try:
        from apps.channels.models import Stream
        stream = Stream.objects.filter(id=int(stream_id)).select_related("m3u_account").first()
        if stream and stream.m3u_account:
            return stream.m3u_account.name
    except Exception:
        pass
    return None


def _username(user_id) -> str:
    """Resolve a client's Dispatcharr user_id to a username, or 'Anonymous'."""
    if not user_id or str(user_id) == "0":
        return "Anonymous"
    try:
        from apps.accounts.models import User
        username = User.objects.filter(id=int(user_id)).values_list("username", flat=True).first()
        return username or f"User {user_id}"
    except Exception:
        return f"User {user_id}"


def _enrich_clients(clients: list) -> list:
    for c in clients:
        c["username"] = _username(c.get("user_id"))
    return clients


def _enrich(info: dict) -> dict:
    """Add stream_profile_name / m3u_profile_name / provider / client usernames."""
    if info.get("stream_profile") and not info.get("stream_profile_name"):
        info["stream_profile_name"] = _stream_profile_name(info.get("stream_profile"))
    if info.get("m3u_profile_id") and not info.get("m3u_profile_name"):
        info["m3u_profile_name"] = _m3u_profile_name(info.get("m3u_profile_id"))
    info["provider"] = _provider_name(info.get("stream_id"))
    if info.get("clients"):
        _enrich_clients(info["clients"])
    return info


def list_sessions() -> list:
    """Basic info for every currently-active channel session."""
    from apps.proxy.live_proxy.server import ProxyServer
    from apps.proxy.live_proxy.channel_status import ChannelStatus

    proxy_server = ProxyServer.get_instance()
    if not proxy_server.redis_client:
        return []

    sessions = []
    cursor = 0
    pattern = "live:channel:*:metadata"
    while True:
        cursor, keys = proxy_server.redis_client.scan(cursor, match=pattern)
        for key in keys:
            m = re.search(r"live:channel:(.*):metadata", key)
            if not m:
                continue
            channel_uuid = m.group(1)
            info = ChannelStatus.get_basic_channel_info(channel_uuid)
            if not info:
                continue
            if not info.get("channel_name"):
                info.update(_channel_display(channel_uuid))
            sessions.append(_enrich(info))
        if cursor == 0:
            break
    return sessions


def session_detail(channel_uuid: str):
    """Full detail for one channel session, or None if not active."""
    from apps.proxy.live_proxy.channel_status import ChannelStatus

    info = ChannelStatus.get_detailed_channel_info(channel_uuid)
    if info is None:
        return None
    if not info.get("channel_name"):
        info.update(_channel_display(channel_uuid))
    return _enrich(info)


def _default_m3u_profile_name(m3u_account) -> "str | None":
    if not m3u_account:
        return None
    try:
        profile = m3u_account.profiles.filter(is_default=True).first()
        return profile.name if profile else None
    except Exception:
        return None


def channel_streams(channel_uuid: str) -> dict:
    """Configured source list for a channel, plus which one is currently active."""
    from apps.channels.models import Channel
    from apps.proxy.live_proxy.channel_status import ChannelStatus

    channel = Channel.objects.filter(uuid=channel_uuid).first()
    if not channel:
        return {"error": "Channel not found"}

    streams = []
    for s in channel.streams.select_related("m3u_account", "stream_profile").order_by("channelstream__order"):
        try:
            stream_profile_name = s.get_stream_profile().name
        except Exception:
            stream_profile_name = None
        streams.append({
            "id": s.id,
            "name": s.name,
            "provider": s.m3u_account.name if s.m3u_account else None,
            # The stream's own profile override if set, otherwise whatever
            # get_stream_profile() falls back to (system default).
            "stream_profile": stream_profile_name,
            # Best-effort: the default profile on that stream's M3U account.
            # The profile actually used at switch time is chosen dynamically
            # based on availability, so this is an indicator, not a guarantee.
            "m3u_profile": _default_m3u_profile_name(s.m3u_account),
            # Last-known technical stats for this specific stream (video/audio
            # codec, resolution, fps, etc), captured the last time it was
            # actually played. None if it's never been used.
            "stats": s.stream_stats or None,
        })

    current_stream_id = None
    info = ChannelStatus.get_basic_channel_info(channel_uuid)
    if info:
        current_stream_id = info.get("stream_id")

    return {"streams": streams, "current_stream_id": current_stream_id}


def switch_source(channel_uuid: str, stream_id: int) -> dict:
    """In-place source swap; does not disconnect existing clients."""
    from apps.proxy.live_proxy.services.channel_service import ChannelService

    return ChannelService.change_stream_url(channel_uuid, target_stream_id=stream_id)


def disconnect_client(channel_uuid: str, client_id: str) -> dict:
    from apps.proxy.live_proxy.services.channel_service import ChannelService

    return ChannelService.stop_client(channel_uuid, client_id)


def stop_channel(channel_uuid: str) -> dict:
    """Stop the whole stream/channel, disconnecting all clients."""
    from apps.proxy.live_proxy.services.channel_service import ChannelService

    return ChannelService.stop_channel(channel_uuid)
