"""API error types and Flask error handler registration."""

from __future__ import annotations

from flask import Flask, jsonify
from werkzeug.exceptions import HTTPException


class ApiError(Exception):
    """Base class for API errors that map to a JSON error response."""

    status_code = 500
    code = "internal_error"

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class NotFoundError(ApiError):
    status_code = 404
    code = "not_found"


class ValidationError(ApiError):
    status_code = 400
    code = "invalid_request"


class SyncError(ApiError):
    status_code = 502
    code = "sync_failed"


def register_error_handlers(app: Flask) -> None:
    """Register handlers that turn errors into a consistent JSON envelope.

    Args:
        app: The Flask app to register handlers on.
    """

    @app.errorhandler(ApiError)
    def _handle_api_error(error: ApiError):
        response = jsonify({"error": {"code": error.code, "message": error.message}})
        response.status_code = error.status_code
        return response

    @app.errorhandler(HTTPException)
    def _handle_http_exception(error: HTTPException):
        response = jsonify(
            {
                "error": {
                    "code": (error.name or "error").lower().replace(" ", "_"),
                    "message": error.description or error.name or "Error",
                }
            }
        )
        response.status_code = error.code or 500
        return response

    @app.errorhandler(Exception)
    def _handle_unexpected_error(error: Exception):
        response = jsonify(
            {"error": {"code": "internal_error", "message": "Internal server error"}}
        )
        response.status_code = 500
        return response
