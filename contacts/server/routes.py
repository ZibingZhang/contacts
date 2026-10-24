"""HTTP routes for the contacts API."""

from __future__ import annotations

from flask import Blueprint, jsonify, request

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


@bp.post("/contacts/batch/tags")
def batch_add_tags():
    body = request.get_json(silent=True) or {}
    contact_ids = body.get("contact_ids")
    tags = body.get("tags")

    if (
        not isinstance(contact_ids, list)
        or not contact_ids
        or not all(isinstance(i, int) for i in contact_ids)
    ):
        raise errors.ValidationError("contact_ids must be a non-empty list of integers")

    if (
        not isinstance(tags, list)
        or not tags
        or not all(isinstance(tag, str) and tag.strip() for tag in tags)
    ):
        raise errors.ValidationError("tags must be a non-empty list of non-empty strings")

    tags = [tag.strip() for tag in tags]

    updated_contacts = service.add_tags_to_contacts(contact_ids, tags)

    return jsonify(
        {
            "contacts": [contact.to_dict() for contact in updated_contacts],
            "tags": service.list_tags(),
        }
    )
