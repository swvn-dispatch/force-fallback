"""Force Fallback dashboard server.

Embeds a gevent WSGI server (own port) inside the Dispatcharr plugin process,
since Dispatcharr's plugin system has no route/static-serving hook of its own.
Serves:

  GET  /health                       Health check (loopback only)
  *    {dash_path}/api/*             JSON API (see dash/api.py)
  GET  {dash_path}[/*]               Static SPA (see dash/api.py::serve_static)

`dash_path` (default "/stats") is read from plugin settings on every request
rather than baked in at build/start time, so it can be reconfigured live.
"""

import logging
import socket

logger = logging.getLogger(__name__)

_server_instance = None
_dash_api = None


def _load_dash_api():
    """Load src/dash/api.py using the same file-path loader as other submodules."""
    global _dash_api
    if _dash_api is not None:
        return _dash_api
    import importlib.util
    import os
    import sys
    parent = __name__.rsplit(".", 1)[0] if "." in __name__ else __name__
    mod_name = f"{parent}.dash_api"
    if mod_name in sys.modules:
        _dash_api = sys.modules[mod_name]
        return _dash_api
    api_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dash", "api.py")
    spec = importlib.util.spec_from_file_location(mod_name, api_path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[mod_name] = mod
    spec.loader.exec_module(mod)
    _dash_api = mod
    return _dash_api


def get_server():
    return _server_instance


def set_server(s):
    global _server_instance
    _server_instance = s


def _settings() -> dict:
    try:
        from apps.plugins.models import PluginConfig
        return PluginConfig.objects.get(key="force_fallback").settings
    except Exception:
        return {}


def _normalized_dash_path() -> str:
    """Return the configured mount path, normalized to e.g. '/stats' (no trailing slash), or '' for root."""
    raw = (_settings().get("dash_path") or "/stats").strip()
    if not raw.startswith("/"):
        raw = "/" + raw
    raw = raw.rstrip("/")
    return raw  # "" means mounted at server root


class ForceFallbackServer:
    def __init__(self, host: str, port: int):
        self.host = host
        self.port = port
        self._server = None
        self._greenlet = None
        self.running = False

    # ------------------------------------------------------------------ WSGI

    def wsgi_app(self, environ, start_response):
        path = environ.get("PATH_INFO", "")
        remote = environ.get("REMOTE_ADDR", "")
        loopback = remote in ("127.0.0.1", "::1")

        if path == "/health":
            if not loopback:
                start_response("403 Forbidden", [("Content-Type", "text/plain")])
                return [b"Forbidden\n"]
            start_response("200 OK", [("Content-Type", "text/plain")])
            return [b"OK\n"]

        try:
            return self._route(path, environ, start_response)
        finally:
            # Everything below here can touch Django's ORM (settings, channel
            # lookups) outside of Django's own request cycle, which never runs
            # Django's usual request_finished cleanup. Do it ourselves so
            # connections don't accumulate and eventually go stale.
            try:
                from django.db import close_old_connections
                close_old_connections()
            except Exception:
                pass

    def _route(self, path, environ, start_response):
        dash_path = _normalized_dash_path()

        if _settings().get("dash_enabled", "disabled") != "enabled":
            start_response("404 Not Found", [("Content-Type", "text/plain")])
            return [b"Not Found\n"]

        # Redirect the bare mount root (no trailing slash) so the browser's
        # location bar ends in "/" -- the SPA build uses relative asset paths,
        # which resolve against the current document's directory.
        if dash_path and path == dash_path:
            start_response("302 Found", [("Location", dash_path + "/")])
            return [b""]

        prefix = dash_path if dash_path else ""
        if path == prefix or path.startswith(prefix + "/"):
            sub = path[len(prefix):] or "/"
            if sub.startswith("/api/"):
                return self._handle_api(sub, environ, start_response)
            return _load_dash_api().serve_static(dash_path, sub, start_response)

        start_response("404 Not Found", [("Content-Type", "text/plain")])
        return [b"Not Found\n"]

    def _handle_api(self, sub_path, environ, start_response):
        api = _load_dash_api()
        method = environ.get("REQUEST_METHOD", "GET")

        if sub_path == "/api/auth/token":
            return api.handle_auth_token(environ, start_response)
        if sub_path == "/api/sessions":
            return api.handle_sessions_list(environ, start_response)

        import re
        m = re.match(r"^/api/sessions/([^/]+)$", sub_path)
        if m:
            return api.handle_session_detail(environ, start_response, m.group(1))

        m = re.match(r"^/api/channels/([^/]+)/streams$", sub_path)
        if m:
            return api.handle_channel_streams(environ, start_response, m.group(1))

        m = re.match(r"^/api/channels/([^/]+)/switch$", sub_path)
        if m:
            return api.handle_channel_switch(environ, start_response, m.group(1))

        m = re.match(r"^/api/channels/([^/]+)/clients/([^/]+)/disconnect$", sub_path)
        if m:
            return api.handle_client_disconnect(environ, start_response, m.group(1), m.group(2))

        start_response("404 Not Found", [("Content-Type", "text/plain")])
        return [b"Not Found\n"]

    # ------------------------------------------------------------- lifecycle

    def start(self) -> bool:
        if self.running:
            logger.warning("Force Fallback server is already running")
            return False

        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind((self.host, self.port))
            sock.close()
        except OSError as e:
            logger.info(f"Force Fallback: port {self.port} already taken, skipping ({e})")
            return False

        try:
            from gevent import pywsgi
            import gevent as _gevent
        except ImportError:
            logger.error("gevent is not installed; cannot start Force Fallback server")
            return False

        def _run():
            try:
                self._server = pywsgi.WSGIServer(
                    (self.host, self.port), self.wsgi_app, log=None,
                )
                self.running = True
                set_server(self)
                self._server.serve_forever()
            except OSError as e:
                # EADDRINUSE here means a concurrent worker won the race between
                # our test-bind above and this re-bind -- expected on multi-worker
                # startup, not an error.
                logger.info(f"Force Fallback: port {self.port} taken by concurrent worker ({e})")
            except Exception as e:  # noqa: BLE001
                logger.error(f"Force Fallback server crashed: {e}", exc_info=True)
            finally:
                self.running = False

        self._greenlet = _gevent.spawn(_run)
        return True

    def stop(self):
        if self._server:
            try:
                self._server.stop()
            except Exception:
                pass
        self.running = False
        set_server(None)
        logger.info("Force Fallback server stopped")

    def is_running(self) -> bool:
        return self.running
