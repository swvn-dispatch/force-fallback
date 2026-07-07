"""Plugin configuration and field definitions for Force Fallback."""

import json
import os

DEFAULT_SERVER_PORT = 9294
DEFAULT_DASH_PATH = "/stats"
DEFAULT_POLL_SECS = 5


def _load_plugin_config() -> dict:
    config_path = os.path.join(os.path.dirname(__file__), "plugin.json")
    with open(config_path, "r") as f:
        return json.load(f)


PLUGIN_CONFIG = _load_plugin_config()

_GLOBAL_SETTINGS_FIELDS = [
    {
        "id": "dash_enabled",
        "label": "Web Dashboard",
        "type": "select",
        "default": "disabled",
        "options": [
            {"value": "disabled", "label": "Disabled"},
            {"value": "enabled", "label": "Enabled"},
        ],
        "description": (
            "Serves a mobile-friendly PWA dashboard for viewing live stream "
            "sessions, connected clients, and swapping sources. Off by "
            "default. You may need to expose the configured port in your "
            "docker-compose.yml to reach it from outside the container. "
            "After changing this or the port, use the 'Restart Dashboard "
            "Server' action below (or restart Dispatcharr) to apply it."
        ),
    },
    {
        "id": "dash_port",
        "label": "Dashboard Port",
        "type": "number",
        "default": DEFAULT_SERVER_PORT,
        "min": 1024,
        "max": 65535,
        "placeholder": str(DEFAULT_SERVER_PORT),
        "description": (
            "TCP port the embedded dashboard server listens on. Requires "
            "the 'Restart Dashboard Server' action (or a Dispatcharr "
            "restart) to take effect."
        ),
    },
    {
        "id": "dash_path",
        "label": "Dashboard Mount Path",
        "type": "string",
        "default": DEFAULT_DASH_PATH,
        "placeholder": DEFAULT_DASH_PATH,
        "description": (
            "URL path the dashboard is served under, e.g. '/stats' gives "
            "http://<host>:<port>/stats/. Takes effect immediately, no "
            "restart needed."
        ),
    },
]

_GLOBAL_SETTINGS_HEADER = {
    "id": "_global_settings_header",
    "label": "── Dashboard Settings ──────────────────────",
    "type": "info",
    "description": "",
}


def build_plugin_fields(settings: dict) -> list:
    """Build the full field list based on current settings."""
    return [_GLOBAL_SETTINGS_HEADER] + _GLOBAL_SETTINGS_FIELDS


# Default field list, used as plugin.json fallback
PLUGIN_FIELDS = build_plugin_fields({})
