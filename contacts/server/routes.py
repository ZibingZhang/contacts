"""Read-only HTTP routes for the contacts API."""

from __future__ import annotations

from flask import Blueprint, jsonify

from contacts.server import errors, service

bp = Blueprint("api", __name__, url_prefix="/api")


@bp.get("/health")
def health():
    return jsonify({"status": "ok"})


@bp.get("/contacts")
def list_contacts():
    contacts = service.list_contacts()
    return jsonify(
        {
            "contacts": [contact.to_dict() for contact in contacts],
            "total": len(contacts),
        }
    )


@bp.get("/contacts/<int:contact_id>")
def get_contact(contact_id: int):
    contact = service.get_contact(contact_id)
    if contact is None:
        raise errors.NotFoundError(f"Contact {contact_id} not found")
    return jsonify(contact.to_dict())


@bp.get("/tags")
def list_tags():
    return jsonify({"tags": service.list_tags()})
