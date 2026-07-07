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
            sessions.append(info)
        if cursor == 0:
            break
    return sessions


def session_detail(channel_uuid: str):
    """Full detail for one channel session, or None if not active."""
    from apps.proxy.live_proxy.channel_status import ChannelStatus

    info = ChannelStatus.get_detailed_channel_info(channel_uuid)
    if info and not info.get("channel_name"):
        info.update(_channel_display(channel_uuid))
    return info


def channel_streams(channel_uuid: str) -> dict:
    """Configured source list for a channel, plus which one is currently active."""
    from apps.channels.models import Channel
    from apps.proxy.live_proxy.channel_status import ChannelStatus

    channel = Channel.objects.filter(uuid=channel_uuid).first()
    if not channel:
        return {"error": "Channel not found"}

    streams = [
        {"id": s.id, "name": s.name}
        for s in channel.streams.all().order_by("channelstream__order")
    ]

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
