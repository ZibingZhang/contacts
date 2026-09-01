"""Flask app factory for the read-only contacts API."""

from __future__ import annotations

from flask import Flask
from flask_cors import CORS

from contacts.server import errors, routes


def create_app() -> Flask:
    """Build the Flask app for the read-only contacts API.

    Returns:
        The configured Flask app.
    """
    app = Flask(__name__)

    # Wildcard CORS is safe here only because this API is read-only,
    # unauthenticated, and bound to localhost -- do not reuse this config if
    # endpoints are added that read cookies/auth headers or bind to 0.0.0.0.
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    app.register_blueprint(routes.bp)
    errors.register_error_handlers(app)

    return app
