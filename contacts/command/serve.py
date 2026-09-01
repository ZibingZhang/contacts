"""Command to run the read-only HTTP API server."""

from __future__ import annotations


def run(*, host: str, port: int, debug: bool) -> None:
    from contacts.server.app import create_app

    create_app().run(host=host, port=port, debug=debug)
