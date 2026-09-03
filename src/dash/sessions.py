"""Thin wrapper around Dispatcharr's live_proxy internals.

Runs in-process (same Django/gevent worker as Dispatcharr core), so these are
plain Python calls -- no HTTP hop, no extra auth needed to reach them.
"""

import logging
import re
from datetime import timezone as dt_timezone

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


def _enrich_clients(clients: list) -> list:
    """Resolve the user and delivery settings for a collection of clients."""
    user_ids = set()
    output_profile_ids = set()
    for c in clients:
        user_id = c.get("user_id")
        if user_id and str(user_id) != "0":
            try:
                user_ids.add(int(user_id))
            except (TypeError, ValueError):
                pass
        profile_id = c.get("output_profile_id")
        if profile_id:
            try:
                output_profile_ids.add(int(profile_id))
            except (TypeError, ValueError):
                pass

    usernames = {}
    profile_names = {}
    try:
        from apps.accounts.models import User
        usernames = dict(User.objects.filter(id__in=user_ids).values_list("id", "username"))
    except Exception:
        pass
    try:
        from core.models import OutputProfile
        profile_names = dict(
            OutputProfile.objects.filter(id__in=output_profile_ids).values_list("id", "name")
        )
    except Exception:
        pass

    for c in clients:
        user_id = c.get("user_id")
        if not user_id or str(user_id) == "0":
            c["username"] = "Anonymous"
        else:
            try:
                c["username"] = usernames.get(int(user_id), f"User {user_id}")
            except (TypeError, ValueError):
                c["username"] = c.get("username") or "Unknown"

        profile_id = c.get("output_profile_id")
        if profile_id:
            try:
                c["output_profile_name"] = profile_names.get(int(profile_id))
            except (TypeError, ValueError):
                c["output_profile_name"] = None
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


def channel_streams(channel_uuid: str) -> dict:
    """Configured source list for a channel, plus which one is currently active."""
    from apps.channels.models import Channel
    from apps.proxy.live_proxy.channel_status import ChannelStatus

    channel = Channel.objects.filter(uuid=channel_uuid).first()
    if not channel:
        return {"error": "Channel not found"}

    streams = [
        {
            "id": s.id,
            "name": s.name,
            "provider": s.m3u_account.name if s.m3u_account else None,
            # Last-known technical stats for this specific stream (video/audio
            # codec, resolution, fps, etc), captured the last time it was
            # actually played. None if it's never been used.
            "stats": s.stream_stats or None,
        }
        for s in channel.streams.select_related("m3u_account").order_by("channelstream__order")
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


def stop_channel(channel_uuid: str) -> dict:
    """Stop the whole stream/channel, disconnecting all clients."""
    from apps.proxy.live_proxy.services.channel_service import ChannelService

    return ChannelService.stop_channel(channel_uuid)


def channel_logo_info(channel_uuid: str):
    """Return ('redirect', url) | ('file', path) | (None, None) for a channel's logo.

    Mirrors Dispatcharr's own LogoViewSet.cache action: local files (paths
    starting with /data) are streamed by our own server, remote URLs are just
    redirected to directly since <img> tags aren't subject to CORS.
    """
    from apps.channels.models import Channel

    channel = Channel.objects.filter(uuid=channel_uuid).select_related("logo").first()
    if not channel or not channel.logo or not channel.logo.url:
        return None, None

    url = channel.logo.url
    if url.startswith("/data"):
        return "file", url
    return "redirect", url


def vod_logo_info(content_type: str, content_uuid: str):
    """Return artwork for a VOD movie or an episode's parent series."""
    from apps.vod.models import Episode, Movie

    if content_type == "movie":
        content = Movie.objects.filter(uuid=content_uuid).select_related("logo").first()
        logo = content.logo if content else None
    elif content_type == "episode":
        content = Episode.objects.filter(uuid=content_uuid).select_related("series__logo").first()
        logo = content.series.logo if content and content.series else None
    else:
        return None, None

    if not logo or not logo.url:
        return None, None
    if logo.url.startswith("/data"):
        return "file", logo.url
    return "redirect", logo.url


def media_connections() -> dict:
    """Return active VOD and catch-up sessions using Dispatcharr's stats builders."""
    from core.utils import RedisClient
    from apps.proxy.vod_proxy.views import build_vod_stats_data
    from apps.timeshift.stats import build_timeshift_stats_data

    redis_client = RedisClient.get_client()
    if not redis_client:
        return {"vod_connections": [], "timeshift_sessions": []}

    vod = build_vod_stats_data(redis_client).get("vod_connections", [])
    catchup = build_timeshift_stats_data(redis_client).get("timeshift_sessions", [])
    catchup_stream_ids = {}
    for session in catchup:
        stats_channel_id = session.get("stats_channel_id")
        if not stats_channel_id:
            continue
        try:
            stream_id = redis_client.hget(
                f"timeshift:channel:{stats_channel_id}:metadata", "stream_id"
            )
            if stream_id:
                catchup_stream_ids[session["session_id"]] = int(stream_id)
        except (TypeError, ValueError):
            continue

    if catchup_stream_ids:
        try:
            from apps.channels.models import Stream

            streams = {
                stream.id: stream
                for stream in Stream.objects.filter(
                    id__in=catchup_stream_ids.values()
                ).select_related("m3u_account")
            }
            for session in catchup:
                stream_id = catchup_stream_ids.get(session.get("session_id"))
                stream = streams.get(stream_id)
                if stream:
                    session["source"] = {
                        "id": stream.id,
                        "name": stream.name,
                        "provider": stream.m3u_account.name if stream.m3u_account else None,
                    }
        except Exception:
            logger.debug("Catch-up source lookup failed", exc_info=True)
    for content in vod:
        _enrich_clients(content.get("connections", []))
    for session in catchup:
        _enrich_clients(session.get("connections", []))
    return {"vod_connections": vod, "timeshift_sessions": catchup}


def stop_vod_client(client_id: str) -> dict:
    """Mirror Dispatcharr's VOD stop endpoint without constructing a request."""
    from core.utils import RedisClient
    from apps.proxy.vod_proxy.multi_worker_connection_manager import get_vod_client_stop_key

    redis_client = RedisClient.get_client()
    if not redis_client:
        return {"status": "error", "message": "Redis unavailable"}
    if not redis_client.exists(f"vod_persistent_connection:{client_id}"):
        return {"status": "error", "message": "Connection not found"}
    redis_client.setex(get_vod_client_stop_key(client_id), 60, "true")
    return {"status": "success", "client_id": client_id}


def stop_catchup_session(session_id: str) -> dict:
    """Stop a catch-up viewer with Dispatcharr's complete cleanup path."""
    from core.utils import RedisClient
    from apps.proxy.utils import stop_timeshift_client
    from apps.timeshift.stats import find_stats_channel_for_session

    redis_client = RedisClient.get_client()
    if not redis_client:
        return {"status": "error", "message": "Redis unavailable"}
    stats_channel_id = find_stats_channel_for_session(redis_client, session_id)
    if not stats_channel_id:
        return {"status": "error", "message": "Connection not found"}
    return stop_timeshift_client(redis_client, stats_channel_id, session_id)


def catchup_programmes(sessions: list) -> list:
    from apps.timeshift.helpers import get_catchup_programmes_for_sessions

    return get_catchup_programmes_for_sessions(sessions)


def live_programmes(channel_uuids: list) -> list:
    """Return the current EPG programme for each requested live channel."""
    from django.utils import timezone
    from apps.channels.models import Channel
    from apps.epg.models import ProgramData

    valid_uuids = [str(uuid) for uuid in channel_uuids[:50] if uuid]
    if not valid_uuids:
        return []
    channels = Channel.objects.filter(uuid__in=valid_uuids).select_related("epg_data")
    epg_ids = [channel.epg_data_id for channel in channels if channel.epg_data_id]
    programmes = ProgramData.objects.filter(
        epg_id__in=epg_ids,
        start_time__lte=timezone.now(),
        end_time__gt=timezone.now(),
    )
    programmes_by_epg = {programme.epg_id: programme for programme in programmes}
    result = []
    for channel in channels:
        programme = programmes_by_epg.get(channel.epg_data_id)
        if not programme:
            continue
        duration = (programme.end_time - programme.start_time).total_seconds()
        result.append({
            "channel_uuid": str(channel.uuid),
            "title": programme.title,
            "sub_title": programme.sub_title or "",
            "description": programme.description or "",
            "start_time": programme.start_time.astimezone(dt_timezone.utc).isoformat(),
            "end_time": programme.end_time.astimezone(dt_timezone.utc).isoformat(),
            "duration_secs": int(duration),
        })
    return result
