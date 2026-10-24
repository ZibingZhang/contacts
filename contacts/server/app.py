"""Flask app factory for the contacts API."""

from __future__ import annotations

import re

from flask import Flask
from flask_cors import CORS

from contacts.server import errors, routes

# Matches the frontend's own origin regardless of which local port it's
# running on (dev server vs. preview build).
_LOCAL_ORIGIN_PATTERN = re.compile(r"^https?://(localhost|127\.0\.0\.1):\d+$")


def create_app() -> Flask:
    """Build the Flask app for the contacts API.

    Returns:
        The configured Flask app.
    """
    app = Flask(__name__)

    # This API is unauthenticated and has endpoints that mutate data, so CORS
    # is restricted to local origins -- do not widen this to "*" or bind the
    # server to 0.0.0.0 without adding authentication first.
    CORS(app, resources={r"/api/*": {"origins": _LOCAL_ORIGIN_PATTERN}})

    app.register_blueprint(routes.bp)
    errors.register_error_handlers(app)

    return app
