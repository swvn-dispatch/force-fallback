"""Dispatcharr Force Fallback plugin.

Mobile-friendly Mantine PWA dashboard showing all running stream sessions,
their live stats, connected clients (with disconnect), and a source-swap
dropdown -- a plugin-ified, mobile-friendly slice of Dispatcharr's own Stats
page.
"""

import json
import logging
import os
import threading

logger = logging.getLogger(__name__)

_PLUGIN_DIR = os.path.dirname(os.path.abspath(__file__))

with open(os.path.join(_PLUGIN_DIR, "plugin.json")) as _f:
    _PLUGIN_CONFIG = json.load(_f)

PLUGIN_DB_KEY = "force_fallback"


def _load_submodule(name: str):
    """Load a sibling module by file path.

    importlib.import_module with a relative package requires the parent to be
    in sys.modules. During Dispatcharr reload cycles that entry may be absent,
    producing KeyError or ModuleNotFoundError. Loading by file path sidesteps
    that lookup entirely.
    """
    import importlib.util
    import sys
    full_name = f"{__name__}.{name}"
    if full_name in sys.modules:
        return sys.modules[full_name]
    spec = importlib.util.spec_from_file_location(
        full_name, os.path.join(_PLUGIN_DIR, f"{name}.py")
    )
    mod = importlib.util.module_from_spec(spec)
    sys.modules[full_name] = mod
    spec.loader.exec_module(mod)
    return mod


def _config():
    return _load_submodule("config")


def _server():
    return _load_submodule("server")


def _close_db_connections():
    """Release Django DB connections opened outside Django's own request cycle.

    Background threads/init here never go through Django's request_finished
    signal, so connections they open are never cleaned up on their own.
    """
    try:
        from django.db import close_old_connections
        close_old_connections()
    except Exception:
        pass


def _get_settings() -> dict:
    try:
        from apps.plugins.models import PluginConfig
        return PluginConfig.objects.get(key=PLUGIN_DB_KEY).settings
    except Exception:
        return {}


class Plugin:
    """Dispatcharr Plugin: Force Fallback stream dashboard."""

    name        = _PLUGIN_CONFIG["name"]
    description = _PLUGIN_CONFIG["description"]
    version     = _PLUGIN_CONFIG["version"]
    author      = _PLUGIN_CONFIG["author"]

    actions = [
        {
            "id": "restart_dash",
            "label": "Restart Dashboard Server",
            "description": "Stop and restart the embedded dashboard server, picking up port/enabled changes without a full Dispatcharr restart.",
            "button_label": "Restart Dashboard Server",
            "button_variant": "filled",
            "button_color": "blue",
        },
    ]

    # Lifecycle (init)

    def __init__(self):
        try:
            self._autostart()
        except Exception as e:
            logger.warning(f"Force Fallback dashboard auto-start skipped: {e}")
        finally:
            _close_db_connections()

    def _autostart(self):
        settings = _get_settings()
        if settings.get("dash_enabled", "disabled") != "enabled":
            return
        srv = _server()
        existing = srv.get_server()
        if existing and existing.is_running():
            return
        result = self._start_server(settings)
        if result.get("status") == "success":
            logger.info(f"Force Fallback auto-start: {result['message']}")
        else:
            logger.warning(f"Force Fallback auto-start failed: {result['message']}")

    # Dynamic fields

    @property
    def fields(self):
        """Regenerate fields from current DB settings on every request."""
        return _config().build_plugin_fields(_get_settings())

    # Action dispatcher

    def run(self, action: str, params: dict, context: dict):
        if action == "restart_dash":
            return self._restart_server()
        return {"status": "error", "message": f"Unknown action: {action}"}

    # start/stop server

    def _start_server(self, settings: dict = None) -> dict:
        cfg = _config()
        settings = settings if settings is not None else _get_settings()
        port = int(settings.get("dash_port") or cfg.DEFAULT_SERVER_PORT)

        srv = _server()
        existing = srv.get_server()
        if existing and existing.is_running():
            existing.stop()

        server = srv.ForceFallbackServer(host="0.0.0.0", port=port)
        if server.start():
            return {
                "status": "success",
                "message": f"Force Fallback dashboard server started on http://0.0.0.0:{port}/",
            }
        return {
            "status": "error",
            "message": f"Failed to start server on port {port}; port may be in use",
        }

    def _restart_server(self) -> dict:
        settings = _get_settings()
        srv = _server()
        existing = srv.get_server()
        if existing and existing.is_running():
            existing.stop()

        if settings.get("dash_enabled", "disabled") != "enabled":
            return {"status": "success", "message": "Dashboard is disabled; server stopped."}

        return self._start_server(settings)

    # Lifecycle

    def stop(self, context: dict):
        """Called when the plugin is disabled or Dispatcharr shuts down."""
        srv = _server()
        server = srv.get_server()
        if server and server.is_running():
            logger.info("Plugin stopping, shutting down Force Fallback dashboard server")
            server.stop()
