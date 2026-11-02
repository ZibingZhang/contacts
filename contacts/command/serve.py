"""Command to run the read-only HTTP API server."""

from __future__ import annotations


def run(*, host: str, port: int, debug: bool) -> None:
    from contacts.server.app import create_app

    # threaded=True so one slow request (e.g. a big association read) doesn't
    # block every other request behind it on Flask's single dev-server thread.
    create_app().run(host=host, port=port, debug=debug, threaded=True)
