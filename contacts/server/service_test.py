"""Tests for contacts.server.service."""

from __future__ import annotations

import copy

import pytest

from contacts import model
from contacts.dao.icloud.icloud_dao import AuthChallenge
from contacts.fixtures import contact_fixtures
from contacts.model import builtin_schemas
from contacts.server import errors, schema_service, service
from contacts.utils.object_utils import Object


@pytest.fixture(autouse=True)
def reset_state():
    service.invalidate_contacts_cache()
    schema_service.invalidate_cache()
    service._pending_sync = None
    service._pending_push = None
    yield
    service.invalidate_contacts_cache()
    schema_service.invalidate_cache()
    service._pending_sync = None
    service._pending_push = None


@pytest.fixture
def contacts() -> list[Object]:
    return [
        contact_fixtures.build(
            id=1, name={"first_name": "John", "last_name": "Smith"}, tags=["A"]
        ),
        contact_fixtures.build(
            id=2, name={"first_name": "Jane", "last_name": "Doe"}, tags=["A", "B"]
        ),
        contact_fixtures.build(id=3, name={"first_name": "Jack", "last_name": "Doe"}),
    ]


def builtin_schema_objects() -> list[Object]:
    """The built-in schemas in their stored form, for stubbing schema reads."""
    return [
        {**built_in.to_dict(), "id": index + 1, "ctime": 0.0, "mtime": 0.0}
        for index, built_in in enumerate(builtin_schemas.BUILT_IN_SCHEMAS.values())
    ]


def stub_disk(monkeypatch, contacts: list[Object]) -> list[list[Object]]:
    """Stubs disk reads, and captures writes so tests can assert on them.

    `disk_dao` is one shared instance, so patching it here covers every module
    that reads through it -- including the schema registry, which is why this
    has to answer schema reads too.
    """

    def read_objects(object_type: str) -> list[Object]:
        if object_type == model.TYPE_SCHEMA:
            return builtin_schema_objects()
        if object_type == model.TYPE_CONTACT:
            return contacts
        return []

    monkeypatch.setattr(service.disk_dao, "read_objects", read_objects)

    written: list[list[Object]] = []
    monkeypatch.setattr(
        service.disk_dao, "update_objects", lambda _, objs: written.append(objs)
    )
    monkeypatch.setattr(
        service.disk_dao, "create_objects", lambda _, objs: written.append(objs)
    )
    return written


def count_contact_reads(monkeypatch, contacts: list[Object]) -> dict[str, int]:
    """Stubs disk reads while counting only the contact reads."""
    calls = {"count": 0}

    def read_objects(object_type: str) -> list[Object]:
        if object_type == model.TYPE_SCHEMA:
            return builtin_schema_objects()
        if object_type == model.TYPE_CONTACT:
            calls["count"] += 1
            return contacts
        return []

    monkeypatch.setattr(service.disk_dao, "read_objects", read_objects)
    monkeypatch.setattr(service.disk_dao, "update_objects", lambda *_: None)
    monkeypatch.setattr(service.disk_dao, "create_objects", lambda *_: None)

    return calls


def stub_icloud(monkeypatch, icloud_contacts: list[Object]) -> None:
    monkeypatch.setattr(service.icloud_dao, "authenticate", lambda **_: None)
    monkeypatch.setattr(
        service.icloud_dao,
        "read_contacts_and_groups",
        lambda **_: (icloud_contacts, []),
    )


def uuid_of(contact: Object) -> str:
    return contact["icloud"]["uuid"]


# -- Aggregates ------------------------------------------------------------


def test_list_contacts(monkeypatch, contacts) -> None:
    stub_disk(monkeypatch, contacts)

    assert service.list_contacts() == contacts


def test_list_contacts_caches_after_first_read(monkeypatch, contacts) -> None:
    read_calls = count_contact_reads(monkeypatch, contacts)

    service.list_contacts()
    service.list_contacts()

    assert read_calls["count"] == 1


def test_invalidate_contacts_cache_forces_reread(monkeypatch, contacts) -> None:
    read_calls = count_contact_reads(monkeypatch, contacts)

    service.list_contacts()
    service.invalidate_contacts_cache()
    service.list_contacts()

    assert read_calls["count"] == 2


def test_list_tags(monkeypatch, contacts) -> None:
    stub_disk(monkeypatch, contacts)

    assert service.list_tags() == [{"tag": "A", "count": 2}, {"tag": "B", "count": 1}]


def test_add_tags_to_contacts_unions_with_existing_tags(monkeypatch, contacts) -> None:
    written = stub_disk(monkeypatch, contacts)

    updated = service.add_tags_to_contacts([1, 3], ["B", "C"])

    assert [contact["tags"] for contact in updated] == [
        ["A", "B", "C"],
        ["B", "C"],
    ]
    assert len(written) == 1


def test_add_tags_to_contacts_does_not_mutate_the_cached_contact(
    monkeypatch, contacts
) -> None:
    stub_disk(monkeypatch, contacts)

    service.add_tags_to_contacts([1], ["C"])

    assert contacts[0]["tags"] == ["A"]


def test_add_tags_to_contacts_invalidates_cache(monkeypatch, contacts) -> None:
    read_calls = count_contact_reads(monkeypatch, contacts)

    service.list_contacts()
    # Serves its own read from the warm cache, then invalidates it...
    service.add_tags_to_contacts([1], ["C"])
    # ...so this one has to go back to disk.
    service.list_contacts()

    assert read_calls["count"] == 2


def test_add_tags_to_contacts_missing_id_raises(monkeypatch, contacts) -> None:
    stub_disk(monkeypatch, contacts)

    with pytest.raises(errors.NotFoundError):
        service.add_tags_to_contacts([999], ["C"])


def test_list_contact_field_options(monkeypatch) -> None:
    stub_disk(
        monkeypatch,
        [
            contact_fixtures.build(
                id=1,
                education={
                    "high_school": {"name": "NHS"},
                    "bachelor": {"name": "Bowdoin"},
                },
            )
        ],
    )

    options = service.list_contact_field_options()

    assert options["high_schools"] == ["NHS"]
    assert options["universities"] == ["Bowdoin"]
    assert "United States" in options["countries"]
    assert {"code": 1, "label": "United States/Canada"} in options["country_codes"]


# -- Pull from iCloud ------------------------------------------------------


def test_start_sync_from_icloud_stages_new_contacts_for_review(
    monkeypatch, contacts
) -> None:
    icloud_contact = contacts[0]
    stub_icloud(monkeypatch, [icloud_contact])
    written = stub_disk(monkeypatch, [])

    result = service.start_sync_from_icloud()

    assert result["status"] == "review"
    assert len(result["created"]) == 1
    assert result["created"][0]["icloud_id"] == uuid_of(icloud_contact)
    assert written == []


def test_start_sync_from_icloud_stages_updated_contacts_for_review(
    monkeypatch, contacts
) -> None:
    disk_contact = contacts[0]
    icloud_contact = copy.deepcopy(disk_contact)
    icloud_contact["notes"] = "updated notes"

    stub_icloud(monkeypatch, [icloud_contact])
    written = stub_disk(monkeypatch, [disk_contact])

    result = service.start_sync_from_icloud()

    assert result["status"] == "review"
    assert result["created"] == []
    assert len(result["updated"]) == 1
    assert result["updated"][0]["icloud_id"] == uuid_of(disk_contact)
    assert result["updated"][0]["before"].get("notes") != "updated notes"
    assert result["updated"][0]["after"]["notes"] == "updated notes"
    # Nothing is written until apply_icloud_sync() accepts it.
    assert written == []


def test_start_sync_from_icloud_no_changes(monkeypatch, contacts) -> None:
    stub_icloud(monkeypatch, [contacts[0]])
    stub_disk(monkeypatch, [contacts[0]])

    result = service.start_sync_from_icloud()

    assert result == {"status": "complete", "created": 0, "updated": 0}


def test_start_sync_from_icloud_wraps_authentication_failure(monkeypatch) -> None:
    def fail(**_):
        raise RuntimeError("nope")

    monkeypatch.setattr(service.icloud_dao, "authenticate", fail)

    with pytest.raises(errors.SyncError, match="Failed to authenticate"):
        service.start_sync_from_icloud()


def test_start_sync_from_icloud_returns_code_challenge(monkeypatch) -> None:
    monkeypatch.setattr(
        service.icloud_dao, "authenticate", lambda **_: AuthChallenge(kind="code")
    )

    result = service.start_sync_from_icloud()

    assert result == {
        "status": "requires_verification",
        "verification_kind": "code",
        "devices": [],
    }


def test_start_sync_from_icloud_returns_device_challenge(monkeypatch) -> None:
    monkeypatch.setattr(
        service.icloud_dao,
        "authenticate",
        lambda **_: AuthChallenge(kind="device_and_code", devices=["iPhone"]),
    )

    result = service.start_sync_from_icloud()

    assert result["verification_kind"] == "device_and_code"
    assert result["devices"] == ["iPhone"]


def test_submit_sync_device_requests_code(monkeypatch) -> None:
    monkeypatch.setattr(
        service.icloud_dao, "submit_verification_device", lambda _: None
    )

    assert service.submit_sync_device(0) == {
        "status": "requires_verification",
        "verification_kind": "code",
        "devices": [],
    }


def test_submit_sync_device_wraps_failure(monkeypatch) -> None:
    def fail(_):
        raise RuntimeError("nope")

    monkeypatch.setattr(service.icloud_dao, "submit_verification_device", fail)

    with pytest.raises(errors.SyncError, match="Failed to send verification code"):
        service.submit_sync_device(0)


def test_submit_sync_code_stages_review(monkeypatch, contacts) -> None:
    monkeypatch.setattr(service.icloud_dao, "submit_verification_code", lambda _: None)
    monkeypatch.setattr(
        service.icloud_dao, "read_contacts_and_groups", lambda **_: ([contacts[0]], [])
    )
    stub_disk(monkeypatch, [])

    result = service.submit_sync_code("123456")

    assert result["status"] == "review"
    assert len(result["created"]) == 1


def test_submit_sync_code_no_changes_completes_directly(monkeypatch, contacts) -> None:
    monkeypatch.setattr(service.icloud_dao, "submit_verification_code", lambda _: None)
    monkeypatch.setattr(
        service.icloud_dao, "read_contacts_and_groups", lambda **_: ([contacts[0]], [])
    )
    stub_disk(monkeypatch, [contacts[0]])

    assert service.submit_sync_code("123456") == {
        "status": "complete",
        "created": 0,
        "updated": 0,
    }


def test_submit_sync_code_wraps_failure(monkeypatch) -> None:
    def fail(_):
        raise RuntimeError("nope")

    monkeypatch.setattr(service.icloud_dao, "submit_verification_code", fail)

    with pytest.raises(errors.SyncError, match="Failed to verify code"):
        service.submit_sync_code("000000")


def test_apply_icloud_sync_writes_only_accepted_creates(monkeypatch, contacts) -> None:
    accepted, declined = contacts[0], contacts[1]
    stub_icloud(monkeypatch, [accepted, declined])
    created: list[list[Object]] = []
    monkeypatch.setattr(service.disk_dao, "read_objects", lambda _: [])
    monkeypatch.setattr(
        service.disk_dao, "create_objects", lambda _, objs: created.append(objs)
    )
    monkeypatch.setattr(service.disk_dao, "update_objects", lambda *_: None)
    service.start_sync_from_icloud()

    result = service.apply_icloud_sync([uuid_of(accepted)], [])

    assert result == {"status": "complete", "created": 1, "updated": 0}
    assert [uuid_of(c) for c in created[0]] == [uuid_of(accepted)]


def test_apply_icloud_sync_writes_only_accepted_updates(monkeypatch, contacts) -> None:
    disk_a, disk_b = contacts[0], contacts[1]
    icloud_a = copy.deepcopy(disk_a)
    icloud_a["notes"] = "a"
    icloud_b = copy.deepcopy(disk_b)
    icloud_b["notes"] = "b"

    stub_icloud(monkeypatch, [icloud_a, icloud_b])
    updated: list[list[Object]] = []
    monkeypatch.setattr(service.disk_dao, "read_objects", lambda _: [disk_a, disk_b])
    monkeypatch.setattr(
        service.disk_dao, "update_objects", lambda _, objs: updated.append(objs)
    )
    monkeypatch.setattr(service.disk_dao, "create_objects", lambda *_: None)
    service.start_sync_from_icloud()

    result = service.apply_icloud_sync([], [uuid_of(disk_a)])

    assert result == {"status": "complete", "created": 0, "updated": 1}
    assert [c["notes"] for c in updated[0]] == ["a"]


def test_apply_icloud_sync_declining_everything_writes_nothing(
    monkeypatch, contacts
) -> None:
    stub_icloud(monkeypatch, [contacts[0]])
    written = stub_disk(monkeypatch, [])
    service.start_sync_from_icloud()

    result = service.apply_icloud_sync([], [])

    assert result == {"status": "complete", "created": 0, "updated": 0}
    assert written == []


def test_apply_icloud_sync_without_pending_review_raises() -> None:
    with pytest.raises(errors.ValidationError, match="No pending iCloud sync"):
        service.apply_icloud_sync([], [])


# -- Push to iCloud --------------------------------------------------------


def test_start_push_to_icloud_stages_new_contacts_for_review(
    monkeypatch, contacts
) -> None:
    disk_contact = contacts[0]
    stub_icloud(monkeypatch, [])
    stub_disk(monkeypatch, [disk_contact])

    result = service.start_push_to_icloud()

    assert result["status"] == "review"
    assert len(result["created"]) == 1
    assert result["created"][0]["icloud_id"] == uuid_of(disk_contact)


def test_start_push_to_icloud_stages_updated_contacts_for_review(
    monkeypatch, contacts
) -> None:
    disk_contact = contacts[0]
    icloud_contact = copy.deepcopy(disk_contact)
    icloud_contact.pop("tags", None)

    stub_icloud(monkeypatch, [icloud_contact])
    stub_disk(monkeypatch, [disk_contact])

    result = service.start_push_to_icloud()

    assert result["status"] == "review"
    assert result["created"] == []
    assert len(result["updated"]) == 1
    assert result["updated"][0]["after"]["tags"] == ["A"]


def test_start_push_to_icloud_no_changes(monkeypatch, contacts) -> None:
    disk_contact = contacts[0]
    stub_icloud(monkeypatch, [copy.deepcopy(disk_contact)])
    stub_disk(monkeypatch, [disk_contact])

    result = service.start_push_to_icloud()

    assert result == {"status": "complete", "created": 0, "updated": 0}


def test_start_push_to_icloud_strips_unsynced_fields_before_diffing(
    monkeypatch, contacts
) -> None:
    disk_contact = contact_fixtures.build(
        id=1, name={"first_name": "John", "deadname": "X"}
    )
    icloud_contact = copy.deepcopy(disk_contact)
    icloud_contact["name"].pop("deadname")

    stub_icloud(monkeypatch, [icloud_contact])
    stub_disk(monkeypatch, [disk_contact])

    result = service.start_push_to_icloud()

    assert result == {"status": "complete", "created": 0, "updated": 0}


def test_start_push_to_icloud_wraps_authentication_failure(monkeypatch) -> None:
    def fail(**_):
        raise RuntimeError("nope")

    monkeypatch.setattr(service.icloud_dao, "authenticate", fail)

    with pytest.raises(errors.SyncError, match="Failed to authenticate"):
        service.start_push_to_icloud()


def test_start_push_to_icloud_returns_code_challenge(monkeypatch) -> None:
    monkeypatch.setattr(
        service.icloud_dao, "authenticate", lambda **_: AuthChallenge(kind="code")
    )

    result = service.start_push_to_icloud()

    assert result["status"] == "requires_verification"


def test_submit_push_device_requests_code(monkeypatch) -> None:
    monkeypatch.setattr(
        service.icloud_dao, "submit_verification_device", lambda _: None
    )

    assert service.submit_push_device(0)["verification_kind"] == "code"


def test_submit_push_device_wraps_failure(monkeypatch) -> None:
    def fail(_):
        raise RuntimeError("nope")

    monkeypatch.setattr(service.icloud_dao, "submit_verification_device", fail)

    with pytest.raises(errors.SyncError, match="Failed to send verification code"):
        service.submit_push_device(0)


def test_submit_push_code_stages_review(monkeypatch, contacts) -> None:
    monkeypatch.setattr(service.icloud_dao, "submit_verification_code", lambda _: None)
    monkeypatch.setattr(
        service.icloud_dao, "read_contacts_and_groups", lambda **_: ([], [])
    )
    stub_disk(monkeypatch, [contacts[0]])

    result = service.submit_push_code("123456")

    assert result["status"] == "review"
    assert len(result["created"]) == 1


def test_submit_push_code_no_changes_completes_directly(monkeypatch, contacts) -> None:
    disk_contact = contacts[0]
    monkeypatch.setattr(service.icloud_dao, "submit_verification_code", lambda _: None)
    monkeypatch.setattr(
        service.icloud_dao,
        "read_contacts_and_groups",
        lambda **_: ([copy.deepcopy(disk_contact)], []),
    )
    stub_disk(monkeypatch, [disk_contact])

    assert service.submit_push_code("123456") == {
        "status": "complete",
        "created": 0,
        "updated": 0,
    }


def test_submit_push_code_wraps_failure(monkeypatch) -> None:
    def fail(_):
        raise RuntimeError("nope")

    monkeypatch.setattr(service.icloud_dao, "submit_verification_code", fail)

    with pytest.raises(errors.SyncError, match="Failed to verify code"):
        service.submit_push_code("000000")


def test_apply_icloud_push_writes_only_accepted_creates(monkeypatch, contacts) -> None:
    accepted, declined = contacts[0], contacts[1]
    stub_icloud(monkeypatch, [])
    stub_disk(monkeypatch, [accepted, declined])
    pushed: list[list[Object]] = []
    monkeypatch.setattr(
        service.icloud_dao, "create_contacts", lambda objs: pushed.append(objs)
    )
    monkeypatch.setattr(service.icloud_dao, "update_contacts", lambda _: None)
    service.start_push_to_icloud()

    result = service.apply_icloud_push([uuid_of(accepted)], [])

    assert result == {"status": "complete", "created": 1, "updated": 0}
    assert [uuid_of(c) for c in pushed[0]] == [uuid_of(accepted)]


def test_apply_icloud_push_writes_only_accepted_updates(monkeypatch, contacts) -> None:
    disk_a, disk_b = contacts[0], contacts[1]
    icloud_a = copy.deepcopy(disk_a)
    icloud_a.pop("tags")
    icloud_b = copy.deepcopy(disk_b)
    icloud_b.pop("tags")

    stub_icloud(monkeypatch, [icloud_a, icloud_b])
    stub_disk(monkeypatch, [disk_a, disk_b])
    pushed: list[list[Object]] = []
    monkeypatch.setattr(
        service.icloud_dao, "update_contacts", lambda objs: pushed.append(list(objs))
    )
    monkeypatch.setattr(service.icloud_dao, "create_contacts", lambda _: None)
    service.start_push_to_icloud()

    result = service.apply_icloud_push([], [uuid_of(disk_a)])

    assert result == {"status": "complete", "created": 0, "updated": 1}
    assert [uuid_of(c) for c in pushed[0]] == [uuid_of(disk_a)]


def test_apply_icloud_push_batches_updates(monkeypatch) -> None:
    disk_contacts = [
        contact_fixtures.build(id=i, name={"first_name": f"C{i}"}, tags=["A"])
        for i in range(1, 8)
    ]
    icloud_contacts = []
    for contact in disk_contacts:
        icloud_contact = copy.deepcopy(contact)
        icloud_contact.pop("tags")
        icloud_contacts.append(icloud_contact)

    stub_icloud(monkeypatch, icloud_contacts)
    stub_disk(monkeypatch, disk_contacts)
    batches: list[int] = []
    monkeypatch.setattr(
        service.icloud_dao, "update_contacts", lambda objs: batches.append(len(objs))
    )
    monkeypatch.setattr(service.icloud_dao, "create_contacts", lambda _: None)
    service.start_push_to_icloud()

    service.apply_icloud_push([], [uuid_of(c) for c in disk_contacts])

    assert batches == [5, 2]


def test_apply_icloud_push_refreshes_disk_etags(monkeypatch, contacts) -> None:
    disk_contact = contacts[0]
    icloud_before = copy.deepcopy(disk_contact)
    icloud_before.pop("tags")

    # After the push, iCloud reports a new etag and nothing else changed.
    icloud_after = copy.deepcopy(disk_contact)
    icloud_after["icloud"]["etag"] = "new-etag"

    reads = [[icloud_before], [icloud_after]]
    monkeypatch.setattr(service.icloud_dao, "authenticate", lambda **_: None)
    monkeypatch.setattr(
        service.icloud_dao,
        "read_contacts_and_groups",
        lambda **_: (reads.pop(0) if reads else [icloud_after], []),
    )
    monkeypatch.setattr(service.disk_dao, "read_objects", lambda _: [disk_contact])
    monkeypatch.setattr(service.icloud_dao, "update_contacts", lambda _: None)
    monkeypatch.setattr(service.icloud_dao, "create_contacts", lambda _: None)
    updated: list[list[Object]] = []
    monkeypatch.setattr(
        service.disk_dao, "update_objects", lambda _, objs: updated.append(objs)
    )
    service.start_push_to_icloud()

    service.apply_icloud_push([], [uuid_of(disk_contact)])

    assert updated
    assert updated[-1][0]["icloud"]["etag"] == "new-etag"


def test_apply_icloud_push_declining_everything_writes_nothing(
    monkeypatch, contacts
) -> None:
    stub_icloud(monkeypatch, [])
    stub_disk(monkeypatch, [contacts[0]])
    pushed: list = []
    monkeypatch.setattr(service.icloud_dao, "create_contacts", pushed.append)
    monkeypatch.setattr(service.icloud_dao, "update_contacts", pushed.append)
    service.start_push_to_icloud()

    result = service.apply_icloud_push([], [])

    assert result == {"status": "complete", "created": 0, "updated": 0}
    assert pushed == []


def test_apply_icloud_push_without_pending_review_raises() -> None:
    with pytest.raises(errors.ValidationError, match="No pending iCloud push"):
        service.apply_icloud_push([], [])


def test_apply_icloud_push_wraps_write_failure(monkeypatch, contacts) -> None:
    accepted = contacts[0]
    stub_icloud(monkeypatch, [])
    stub_disk(monkeypatch, [accepted])

    def fail(_):
        raise RuntimeError("nope")

    monkeypatch.setattr(service.icloud_dao, "create_contacts", fail)
    service.start_push_to_icloud()

    with pytest.raises(errors.SyncError, match="Failed to push to iCloud"):
        service.apply_icloud_push([uuid_of(accepted)], [])
