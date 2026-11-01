"""HTTP routes for the contacts API."""

from __future__ import annotations

from flask import Blueprint, jsonify, request

from contacts.server import admin_console_service, errors, service

bp = Blueprint("api", __name__, url_prefix="/api")


@bp.get("/health")
def health():
    return jsonify({"status": "ok"})


@bp.post("/sync")
def sync():
    result = service.start_sync_from_icloud()
    return jsonify(result)


@bp.post("/sync/device")
def sync_device():
    body = request.get_json(silent=True) or {}
    device_index = body.get("device_index")

    if not isinstance(device_index, int) or isinstance(device_index, bool):
        raise errors.ValidationError("device_index must be an integer")

    result = service.submit_sync_device(device_index)
    return jsonify(result)


@bp.post("/sync/code")
def sync_code():
    body = request.get_json(silent=True) or {}
    code = body.get("code")

    if not isinstance(code, str) or not code.strip():
        raise errors.ValidationError("code must be a non-empty string")

    result = service.submit_sync_code(code.strip())
    return jsonify(result)


@bp.post("/sync/apply")
def sync_apply():
    body = request.get_json(silent=True) or {}
    create_icloud_ids = _validate_icloud_id_list(body, "create_icloud_ids")
    update_icloud_ids = _validate_icloud_id_list(body, "update_icloud_ids")

    result = service.apply_icloud_sync(create_icloud_ids, update_icloud_ids)
    return jsonify(result)


@bp.post("/push")
def push():
    result = service.start_push_to_icloud()
    return jsonify(result)


@bp.post("/push/device")
def push_device():
    body = request.get_json(silent=True) or {}
    device_index = body.get("device_index")

    if not isinstance(device_index, int) or isinstance(device_index, bool):
        raise errors.ValidationError("device_index must be an integer")

    result = service.submit_push_device(device_index)
    return jsonify(result)


@bp.post("/push/code")
def push_code():
    body = request.get_json(silent=True) or {}
    code = body.get("code")

    if not isinstance(code, str) or not code.strip():
        raise errors.ValidationError("code must be a non-empty string")

    result = service.submit_push_code(code.strip())
    return jsonify(result)


@bp.post("/push/apply")
def push_apply():
    body = request.get_json(silent=True) or {}
    create_icloud_ids = _validate_icloud_id_list(body, "create_icloud_ids")
    update_icloud_ids = _validate_icloud_id_list(body, "update_icloud_ids")

    result = service.apply_icloud_push(create_icloud_ids, update_icloud_ids)
    return jsonify(result)


def _validate_icloud_id_list(body: dict, field_name: str) -> list[str]:
    value = body.get(field_name, [])
    if not isinstance(value, list) or not all(isinstance(i, str) for i in value):
        raise errors.ValidationError(f"{field_name} must be a list of strings")
    return value


@bp.get("/contacts")
def list_contacts():
    contacts = service.list_contacts()
    return jsonify(
        {
            "contacts": [contact.to_dict() for contact in contacts],
            "total": len(contacts),
        }
    )


@bp.get("/contacts/options")
def contact_options():
    return jsonify(service.list_contact_field_options())


@bp.post("/contacts")
def create_contact():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise errors.ValidationError("Request body must be a JSON object")

    data = {k: v for k, v in body.items() if k not in ("id", "ctime", "mtime", "icloud")}
    contact = service.create_contact(data)
    return jsonify(contact.to_dict()), 201


@bp.get("/contacts/<int:contact_id>")
def get_contact(contact_id: int):
    contact = service.get_contact(contact_id)
    if contact is None:
        raise errors.NotFoundError(f"Contact {contact_id} not found")
    return jsonify(contact.to_dict())


@bp.put("/contacts/<int:contact_id>")
def update_contact(contact_id: int):
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise errors.ValidationError("Request body must be a JSON object")

    data = {k: v for k, v in body.items() if k not in ("id", "ctime", "mtime", "icloud")}
    contact = service.update_contact(contact_id, data)
    return jsonify(contact.to_dict())


@bp.get("/groups")
def list_groups():
    groups = service.list_groups()
    return jsonify(
        {
            "groups": [group.to_dict() for group in groups],
            "total": len(groups),
        }
    )


@bp.post("/groups")
def create_group():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise errors.ValidationError("Request body must be a JSON object")

    data = {
        k: v for k, v in body.items() if k not in ("id", "ids", "ctime", "mtime", "icloud")
    }
    group = service.create_group(data)
    return jsonify(group.to_dict()), 201


@bp.get("/groups/<int:group_id>")
def get_group(group_id: int):
    group = service.get_group(group_id)
    if group is None:
        raise errors.NotFoundError(f"Group {group_id} not found")
    return jsonify(group.to_dict())


@bp.put("/groups/<int:group_id>")
def update_group(group_id: int):
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise errors.ValidationError("Request body must be a JSON object")

    data = {
        k: v for k, v in body.items() if k not in ("id", "ids", "ctime", "mtime", "icloud")
    }
    group = service.update_group(group_id, data)
    return jsonify(group.to_dict())


@bp.post("/groups/<int:group_id>/refresh")
def refresh_group(group_id: int):
    group = service.refresh_group(group_id)
    return jsonify(group.to_dict())


@bp.post("/groups/refresh")
def refresh_groups():
    groups = service.refresh_groups()
    return jsonify(
        {
            "groups": [group.to_dict() for group in groups],
            "total": len(groups),
        }
    )


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


@bp.post("/admin/query")
def admin_query():
    sql = _validate_sql_body(request.get_json(silent=True))
    return jsonify(admin_console_service.run_readonly_query(sql))


@bp.post("/admin/execute")
def admin_execute():
    sql = _validate_sql_body(request.get_json(silent=True))
    return jsonify(admin_console_service.run_query(sql))


def _validate_sql_body(body: dict | None) -> str:
    if not isinstance(body, dict):
        raise errors.ValidationError("Request body must be a JSON object")

    sql = body.get("sql")
    if not isinstance(sql, str) or not sql.strip():
        raise errors.ValidationError("sql must be a non-empty string")

    return sql.strip()
