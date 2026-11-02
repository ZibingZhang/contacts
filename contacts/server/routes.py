"""HTTP routes for the API."""

from __future__ import annotations

from flask import Blueprint, jsonify, request

from contacts import model
from contacts.server import (
    admin_console_service,
    association_service,
    errors,
    list_service,
    object_service,
    schema_service,
    service,
)
from contacts.utils.object_utils import Object

bp = Blueprint("api", __name__, url_prefix="/api")


def _json_body() -> Object:
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise errors.ValidationError("Request body must be a JSON object")
    return body


def _validate_int_list(body: Object, field_name: str) -> list[int]:
    value = body.get(field_name)
    if (
        not isinstance(value, list)
        or not value
        or not all(isinstance(i, int) and not isinstance(i, bool) for i in value)
    ):
        raise errors.ValidationError(
            f"{field_name} must be a non-empty list of integers"
        )
    return value


def _validate_icloud_id_list(body: Object, field_name: str) -> list[str]:
    value = body.get(field_name, [])
    if not isinstance(value, list) or not all(isinstance(i, str) for i in value):
        raise errors.ValidationError(f"{field_name} must be a list of strings")
    return value


@bp.get("/health")
def health():
    return jsonify({"status": "ok"})


# -- Schemas ---------------------------------------------------------------


@bp.get("/schemas")
def list_schemas():
    schemas = schema_service.list_schemas()
    return jsonify({"schemas": schemas, "total": len(schemas)})


@bp.get("/schemas/<name>")
def get_schema(name: str):
    return jsonify(schema_service.get_schema_object(name))


@bp.post("/schemas")
def create_schema():
    return jsonify(schema_service.create_schema(_json_body())), 201


@bp.put("/schemas/<name>")
def update_schema(name: str):
    return jsonify(schema_service.update_schema(name, _json_body()))


@bp.delete("/schemas/<name>")
def delete_schema(name: str):
    schema_service.delete_schema(name)
    return jsonify({"status": "deleted", "name": name})


# -- Objects ---------------------------------------------------------------


@bp.get("/objects/<object_type>")
def list_objects(object_type: str):
    objects = object_service.list_objects(object_type)
    return jsonify({"objects": objects, "total": len(objects)})


@bp.post("/objects/<object_type>")
def create_object(object_type: str):
    return jsonify(object_service.create_object(object_type, _json_body())), 201


@bp.get("/objects/<object_type>/<int:object_id>")
def get_object(object_type: str, object_id: int):
    return jsonify(object_service.require_object(object_type, object_id))


@bp.put("/objects/<object_type>/<int:object_id>")
def update_object(object_type: str, object_id: int):
    return jsonify(object_service.update_object(object_type, object_id, _json_body()))


@bp.delete("/objects/<object_type>/<int:object_id>")
def delete_object(object_type: str, object_id: int):
    deleted_associations = object_service.delete_object(object_type, object_id)
    return jsonify(
        {
            "status": "deleted",
            "type": object_type,
            "id": object_id,
            "deleted_associations": deleted_associations,
        }
    )


# -- Contacts: aggregates the UI needs -------------------------------------


@bp.get("/objects/contact/options")
def contact_options():
    return jsonify(service.list_contact_field_options())


@bp.get("/tags")
def list_tags():
    return jsonify({"tags": service.list_tags()})


@bp.post("/objects/contact/batch/tags")
def batch_add_tags():
    body = _json_body()
    contact_ids = _validate_int_list(body, "contact_ids")
    tags = body.get("tags")

    if (
        not isinstance(tags, list)
        or not tags
        or not all(isinstance(tag, str) and tag.strip() for tag in tags)
    ):
        raise errors.ValidationError(
            "tags must be a non-empty list of non-empty strings"
        )

    updated_contacts = service.add_tags_to_contacts(
        contact_ids, [tag.strip() for tag in tags]
    )

    return jsonify({"contacts": updated_contacts, "tags": service.list_tags()})


# -- Lists -----------------------------------------------------------------


@bp.get("/lists/member-ids")
def all_list_member_ids():
    # Keys are strings in JSON, so the client has to parse them back.
    member_ids = list_service.all_member_ids()
    return jsonify({"member_ids": {str(k): v for k, v in member_ids.items()}})


@bp.get("/lists/<int:list_id>/members")
def list_members(list_id: int):
    members = list_service.members(list_id)
    return jsonify({"objects": members, "total": len(members)})


@bp.get("/lists/<int:list_id>/member-ids")
def list_member_ids(list_id: int):
    ids = list_service.member_ids(list_id)
    return jsonify({"ids": ids, "total": len(ids)})


@bp.post("/lists/<int:list_id>/members")
def add_list_members(list_id: int):
    ids = _validate_int_list(_json_body(), "ids")
    return jsonify({"ids": list_service.add_members(list_id, ids)})


@bp.delete("/lists/<int:list_id>/members")
def remove_list_members(list_id: int):
    ids = _validate_int_list(_json_body(), "ids")
    return jsonify({"ids": list_service.remove_members(list_id, ids)})


@bp.post("/lists/<int:list_id>/refresh")
def refresh_list(list_id: int):
    return jsonify(list_service.refresh_list(list_id))


@bp.post("/lists/refresh")
def refresh_lists():
    lists = list_service.refresh_lists()
    return jsonify({"objects": lists, "total": len(lists)})


# -- Associations ----------------------------------------------------------


@bp.get("/associations/<object_type>/<int:object_id>")
def list_associations(object_type: str, object_id: int):
    associations = association_service.list_for(object_type, object_id)
    return jsonify({"objects": associations, "total": len(associations)})


@bp.post("/associations")
def create_association():
    body = _json_body()
    sides = ("object_type_1", "object_id_1", "object_type_2", "object_id_2")

    # Associating the same pair twice is a no-op rather than a duplicate.
    if all(key in body for key in sides):
        existing = association_service.find(*(body[key] for key in sides))
        if existing is not None:
            return jsonify(existing)

    created = object_service.create_object(model.TYPE_ASSOCIATION, body)
    return jsonify(created), 201


@bp.delete("/associations/<int:association_id>")
def delete_association(association_id: int):
    object_service.delete_object(model.TYPE_ASSOCIATION, association_id)
    return jsonify({"status": "deleted", "id": association_id})


# -- iCloud sync and push --------------------------------------------------


@bp.post("/sync")
def sync():
    return jsonify(service.start_sync_from_icloud())


@bp.post("/sync/device")
def sync_device():
    body = request.get_json(silent=True) or {}
    device_index = body.get("device_index")

    if not isinstance(device_index, int) or isinstance(device_index, bool):
        raise errors.ValidationError("device_index must be an integer")

    return jsonify(service.submit_sync_device(device_index))


@bp.post("/sync/code")
def sync_code():
    body = request.get_json(silent=True) or {}
    code = body.get("code")

    if not isinstance(code, str) or not code.strip():
        raise errors.ValidationError("code must be a non-empty string")

    return jsonify(service.submit_sync_code(code.strip()))


@bp.post("/sync/apply")
def sync_apply():
    body = request.get_json(silent=True) or {}
    return jsonify(
        service.apply_icloud_sync(
            _validate_icloud_id_list(body, "create_icloud_ids"),
            _validate_icloud_id_list(body, "update_icloud_ids"),
        )
    )


@bp.post("/push")
def push():
    return jsonify(service.start_push_to_icloud())


@bp.post("/push/device")
def push_device():
    body = request.get_json(silent=True) or {}
    device_index = body.get("device_index")

    if not isinstance(device_index, int) or isinstance(device_index, bool):
        raise errors.ValidationError("device_index must be an integer")

    return jsonify(service.submit_push_device(device_index))


@bp.post("/push/code")
def push_code():
    body = request.get_json(silent=True) or {}
    code = body.get("code")

    if not isinstance(code, str) or not code.strip():
        raise errors.ValidationError("code must be a non-empty string")

    return jsonify(service.submit_push_code(code.strip()))


@bp.post("/push/apply")
def push_apply():
    body = request.get_json(silent=True) or {}
    return jsonify(
        service.apply_icloud_push(
            _validate_icloud_id_list(body, "create_icloud_ids"),
            _validate_icloud_id_list(body, "update_icloud_ids"),
        )
    )


# -- Admin SQL console -----------------------------------------------------


@bp.post("/admin/query")
def admin_query():
    return jsonify(admin_console_service.run_readonly_query(_validate_sql_body()))


@bp.post("/admin/execute")
def admin_execute():
    return jsonify(admin_console_service.run_query(_validate_sql_body()))


def _validate_sql_body() -> str:
    body = _json_body()

    sql = body.get("sql")
    if not isinstance(sql, str) or not sql.strip():
        raise errors.ValidationError("sql must be a non-empty string")

    return sql.strip()
