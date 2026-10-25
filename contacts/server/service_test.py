"""Tests for contacts.server.service."""

from __future__ import annotations

import pytest

from contacts import model
from contacts.dao.icloud.icloud_dao import AuthChallenge
from contacts.fixtures import contact_fixtures
from contacts.server import service


@pytest.fixture(autouse=True)
def reset_contacts_cache():
    service.invalidate_contacts_cache()
    service._pending_sync = None
    service._pending_push = None
    yield
    service.invalidate_contacts_cache()
    service._pending_sync = None
    service._pending_push = None


@pytest.fixture
def contacts() -> list[model.Contact]:
    return [
        contact_fixtures.build(
            id=1, name=model.Name(first_name="John", last_name="Smith"), tags=["A"]
        ),
        contact_fixtures.build(
            id=2, name=model.Name(first_name="Jane", last_name="Doe"), tags=["A", "B"]
        ),
        contact_fixtures.build(
            id=3, name=model.Name(first_name="Jack", last_name="Doe")
        ),
    ]


def test_list_contacts(monkeypatch, contacts) -> None:
    monkeypatch.setattr(service.disk_dao, "read_contacts", lambda: contacts)

    assert service.list_contacts() == contacts


def test_list_contacts_caches_after_first_read(monkeypatch, contacts) -> None:
    read_calls = 0

    def read_contacts():
        nonlocal read_calls
        read_calls += 1
        return contacts

    monkeypatch.setattr(service.disk_dao, "read_contacts", read_contacts)

    service.list_contacts()
    service.list_contacts()

    assert read_calls == 1


def test_invalidate_contacts_cache_forces_reread(monkeypatch, contacts) -> None:
    read_calls = 0

    def read_contacts():
        nonlocal read_calls
        read_calls += 1
        return contacts

    monkeypatch.setattr(service.disk_dao, "read_contacts", read_contacts)

    service.list_contacts()
    service.invalidate_contacts_cache()
    service.list_contacts()

    assert read_calls == 2


def test_get_contact_found(monkeypatch, contacts) -> None:
    monkeypatch.setattr(service.disk_dao, "read_contacts", lambda: contacts)

    assert service.get_contact(2) == contacts[1]


def test_get_contact_not_found(monkeypatch, contacts) -> None:
    monkeypatch.setattr(service.disk_dao, "read_contacts", lambda: contacts)

    assert service.get_contact(999) is None


def test_list_tags(monkeypatch, contacts) -> None:
    monkeypatch.setattr(service.disk_dao, "read_contacts", lambda: contacts)

    assert service.list_tags() == [{"tag": "A", "count": 2}, {"tag": "B", "count": 1}]


def test_add_tags_to_contacts_unions_with_existing_tags(monkeypatch, contacts) -> None:
    monkeypatch.setattr(service.disk_dao, "read_contacts", lambda: contacts)
    written = []
    monkeypatch.setattr(service.disk_dao, "update_contacts", written.append)

    updated = service.add_tags_to_contacts([1, 3], ["B", "C"])

    assert [contact.tags for contact in updated] == [["A", "B", "C"], ["B", "C"]]
    assert len(written) == 1


def test_add_tags_to_contacts_invalidates_cache(monkeypatch, contacts) -> None:
    monkeypatch.setattr(service.disk_dao, "read_contacts", lambda: contacts)
    monkeypatch.setattr(service.disk_dao, "update_contacts", lambda _: None)

    service.list_contacts()
    service.add_tags_to_contacts([1], ["C"])

    read_calls = 0

    def read_contacts():
        nonlocal read_calls
        read_calls += 1
        return contacts

    monkeypatch.setattr(service.disk_dao, "read_contacts", read_contacts)
    service.list_contacts()

    assert read_calls == 1


def test_add_tags_to_contacts_missing_id_raises(monkeypatch, contacts) -> None:
    monkeypatch.setattr(service.disk_dao, "read_contacts", lambda: contacts)

    with pytest.raises(service.errors.NotFoundError):
        service.add_tags_to_contacts([1, 999], ["C"])


def test_start_sync_from_icloud_stages_new_contacts_for_review(monkeypatch, contacts) -> None:
    new_contact = contact_fixtures.build(name=model.Name(first_name="New"))

    monkeypatch.setattr(service.icloud_dao, "authenticate", lambda **_: None)
    monkeypatch.setattr(
        service.icloud_dao,
        "read_contacts_and_groups",
        lambda **_: ([new_contact], []),
    )
    monkeypatch.setattr(service.disk_dao, "read_contacts", lambda: [])
    created = []
    monkeypatch.setattr(service.disk_dao, "create_contacts", created.append)
    monkeypatch.setattr(service.disk_dao, "update_contacts", lambda _: None)

    result = service.start_sync_from_icloud()

    assert result == {
        "status": "review",
        "created": [
            {"icloud_id": new_contact.icloud.uuid, "contact": new_contact.to_dict()}
        ],
        "updated": [],
    }
    # Nothing is written until apply_icloud_sync() accepts it.
    assert created == []


def test_start_sync_from_icloud_stages_updated_contacts_for_review(monkeypatch, contacts) -> None:
    disk_contact = contacts[0]
    icloud_contact = disk_contact.copy()
    icloud_contact.notes = "updated notes"

    monkeypatch.setattr(service.icloud_dao, "authenticate", lambda **_: None)
    monkeypatch.setattr(
        service.icloud_dao,
        "read_contacts_and_groups",
        lambda **_: ([icloud_contact], []),
    )
    monkeypatch.setattr(service.disk_dao, "read_contacts", lambda: [disk_contact])
    monkeypatch.setattr(service.disk_dao, "create_contacts", lambda _: None)
    updated = []
    monkeypatch.setattr(service.disk_dao, "update_contacts", updated.append)

    result = service.start_sync_from_icloud()

    assert result["status"] == "review"
    assert result["created"] == []
    assert len(result["updated"]) == 1
    assert result["updated"][0]["icloud_id"] == disk_contact.icloud.uuid
    assert result["updated"][0]["before"].get("notes") != "updated notes"
    assert result["updated"][0]["after"]["notes"] == "updated notes"
    # Nothing is written until apply_icloud_sync() accepts it.
    assert updated == []


def test_start_sync_from_icloud_no_changes(monkeypatch, contacts) -> None:
    disk_contact = contacts[0]
    icloud_contact = disk_contact.copy()

    monkeypatch.setattr(service.icloud_dao, "authenticate", lambda **_: None)
    monkeypatch.setattr(
        service.icloud_dao,
        "read_contacts_and_groups",
        lambda **_: ([icloud_contact], []),
    )
    monkeypatch.setattr(service.disk_dao, "read_contacts", lambda: [disk_contact])
    monkeypatch.setattr(service.disk_dao, "create_contacts", lambda _: None)
    monkeypatch.setattr(service.disk_dao, "update_contacts", lambda _: None)

    result = service.start_sync_from_icloud()

    assert result == {"status": "complete", "created": 0, "updated": 0}


def test_start_sync_from_icloud_wraps_authentication_failure(monkeypatch) -> None:
    def fail_authenticate(**_):
        raise RuntimeError("boom")

    monkeypatch.setattr(service.icloud_dao, "authenticate", fail_authenticate)

    with pytest.raises(service.errors.SyncError):
        service.start_sync_from_icloud()


def test_start_sync_from_icloud_returns_code_challenge(monkeypatch) -> None:
    monkeypatch.setattr(
        service.icloud_dao,
        "authenticate",
        lambda **_: AuthChallenge(kind="code"),
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

    assert result == {
        "status": "requires_verification",
        "verification_kind": "device_and_code",
        "devices": ["iPhone"],
    }


def test_submit_sync_device_requests_code(monkeypatch) -> None:
    monkeypatch.setattr(service.icloud_dao, "submit_verification_device", lambda _: None)

    result = service.submit_sync_device(0)

    assert result == {
        "status": "requires_verification",
        "verification_kind": "code",
        "devices": [],
    }


def test_submit_sync_device_wraps_failure(monkeypatch) -> None:
    def fail(_):
        raise RuntimeError("boom")

    monkeypatch.setattr(service.icloud_dao, "submit_verification_device", fail)

    with pytest.raises(service.errors.SyncError):
        service.submit_sync_device(0)


def test_submit_sync_code_stages_review(monkeypatch, contacts) -> None:
    new_contact = contact_fixtures.build(name=model.Name(first_name="New"))

    monkeypatch.setattr(service.icloud_dao, "submit_verification_code", lambda _: None)
    monkeypatch.setattr(
        service.icloud_dao, "read_contacts_and_groups", lambda **_: ([new_contact], [])
    )
    monkeypatch.setattr(service.disk_dao, "read_contacts", lambda: [])
    monkeypatch.setattr(service.disk_dao, "create_contacts", lambda _: None)
    monkeypatch.setattr(service.disk_dao, "update_contacts", lambda _: None)

    result = service.submit_sync_code("123456")

    assert result["status"] == "review"
    assert [c["icloud_id"] for c in result["created"]] == [new_contact.icloud.uuid]


def test_submit_sync_code_no_changes_completes_directly(monkeypatch, contacts) -> None:
    monkeypatch.setattr(service.icloud_dao, "submit_verification_code", lambda _: None)
    monkeypatch.setattr(
        service.icloud_dao, "read_contacts_and_groups", lambda **_: ([], [])
    )
    monkeypatch.setattr(service.disk_dao, "read_contacts", lambda: [])
    monkeypatch.setattr(service.disk_dao, "create_contacts", lambda _: None)
    monkeypatch.setattr(service.disk_dao, "update_contacts", lambda _: None)

    result = service.submit_sync_code("123456")

    assert result == {"status": "complete", "created": 0, "updated": 0}


def test_submit_sync_code_wraps_failure(monkeypatch) -> None:
    def fail(_):
        raise RuntimeError("boom")

    monkeypatch.setattr(service.icloud_dao, "submit_verification_code", fail)

    with pytest.raises(service.errors.SyncError):
        service.submit_sync_code("123456")


def test_apply_icloud_sync_writes_only_accepted_creates(monkeypatch, contacts) -> None:
    accepted = contact_fixtures.build(name=model.Name(first_name="Accepted"))
    declined = contact_fixtures.build(name=model.Name(first_name="Declined"))
    service._pending_sync = {"created": [accepted, declined], "updated": []}

    created = []
    monkeypatch.setattr(service.disk_dao, "create_contacts", created.append)
    monkeypatch.setattr(service.disk_dao, "update_contacts", lambda _: None)

    result = service.apply_icloud_sync([accepted.icloud.uuid], [])

    assert result == {"status": "complete", "created": 1, "updated": 0}
    assert created == [[accepted]]
    assert service._pending_sync is None


def test_apply_icloud_sync_writes_only_accepted_updates(monkeypatch, contacts) -> None:
    disk_contact = contacts[0]
    accepted_update = disk_contact.copy()
    accepted_update.notes = "accepted"
    declined_disk_contact = contacts[1]
    declined_update = declined_disk_contact.copy()
    declined_update.notes = "declined"
    service._pending_sync = {
        "created": [],
        "updated": [
            (disk_contact, accepted_update),
            (declined_disk_contact, declined_update),
        ],
    }

    updated = []
    monkeypatch.setattr(service.disk_dao, "create_contacts", lambda _: None)
    monkeypatch.setattr(service.disk_dao, "update_contacts", updated.append)

    result = service.apply_icloud_sync([], [accepted_update.icloud.uuid])

    assert result == {"status": "complete", "created": 0, "updated": 1}
    assert updated == [[accepted_update]]
    assert service._pending_sync is None


def test_apply_icloud_sync_declining_everything_writes_nothing(monkeypatch) -> None:
    contact = contact_fixtures.build(name=model.Name(first_name="New"))
    service._pending_sync = {"created": [contact], "updated": []}

    created = []
    monkeypatch.setattr(service.disk_dao, "create_contacts", created.append)
    monkeypatch.setattr(service.disk_dao, "update_contacts", lambda _: None)

    result = service.apply_icloud_sync([], [])

    assert result == {"status": "complete", "created": 0, "updated": 0}
    assert created == []


def test_apply_icloud_sync_without_pending_review_raises(monkeypatch) -> None:
    with pytest.raises(service.errors.ValidationError):
        service.apply_icloud_sync([], [])


def test_start_push_to_icloud_stages_new_contacts_for_review(monkeypatch, contacts) -> None:
    local_only = contacts[0]

    monkeypatch.setattr(service.icloud_dao, "authenticate", lambda **_: None)
    monkeypatch.setattr(
        service.icloud_dao, "read_contacts_and_groups", lambda **_: ([], [])
    )
    monkeypatch.setattr(service.disk_dao, "read_contacts", lambda: [local_only])

    result = service.start_push_to_icloud()

    assert result["status"] == "review"
    assert [c["icloud_id"] for c in result["created"]] == [local_only.icloud.uuid]
    assert result["updated"] == []


def test_start_push_to_icloud_stages_updated_contacts_for_review(monkeypatch, contacts) -> None:
    disk_contact = contacts[0]
    icloud_contact = disk_contact.copy()
    icloud_contact.notes = "stale on icloud"

    monkeypatch.setattr(service.icloud_dao, "authenticate", lambda **_: None)
    monkeypatch.setattr(
        service.icloud_dao,
        "read_contacts_and_groups",
        lambda **_: ([icloud_contact], []),
    )
    monkeypatch.setattr(service.disk_dao, "read_contacts", lambda: [disk_contact])

    result = service.start_push_to_icloud()

    assert result["status"] == "review"
    assert result["created"] == []
    assert len(result["updated"]) == 1
    assert result["updated"][0]["icloud_id"] == disk_contact.icloud.uuid
    assert result["updated"][0]["before"]["notes"] == "stale on icloud"
    assert result["updated"][0]["after"].get("notes") != "stale on icloud"


def test_start_push_to_icloud_no_changes(monkeypatch, contacts) -> None:
    disk_contact = contacts[0]
    icloud_contact = disk_contact.copy()

    monkeypatch.setattr(service.icloud_dao, "authenticate", lambda **_: None)
    monkeypatch.setattr(
        service.icloud_dao,
        "read_contacts_and_groups",
        lambda **_: ([icloud_contact], []),
    )
    monkeypatch.setattr(service.disk_dao, "read_contacts", lambda: [disk_contact])

    result = service.start_push_to_icloud()

    assert result == {"status": "complete", "created": 0, "updated": 0}


def test_start_push_to_icloud_wraps_authentication_failure(monkeypatch) -> None:
    def fail_authenticate(**_):
        raise RuntimeError("boom")

    monkeypatch.setattr(service.icloud_dao, "authenticate", fail_authenticate)

    with pytest.raises(service.errors.SyncError):
        service.start_push_to_icloud()


def test_start_push_to_icloud_returns_code_challenge(monkeypatch) -> None:
    monkeypatch.setattr(
        service.icloud_dao,
        "authenticate",
        lambda **_: AuthChallenge(kind="code"),
    )

    result = service.start_push_to_icloud()

    assert result == {
        "status": "requires_verification",
        "verification_kind": "code",
        "devices": [],
    }


def test_submit_push_device_requests_code(monkeypatch) -> None:
    monkeypatch.setattr(service.icloud_dao, "submit_verification_device", lambda _: None)

    result = service.submit_push_device(0)

    assert result == {
        "status": "requires_verification",
        "verification_kind": "code",
        "devices": [],
    }


def test_submit_push_device_wraps_failure(monkeypatch) -> None:
    def fail(_):
        raise RuntimeError("boom")

    monkeypatch.setattr(service.icloud_dao, "submit_verification_device", fail)

    with pytest.raises(service.errors.SyncError):
        service.submit_push_device(0)


def test_submit_push_code_stages_review(monkeypatch, contacts) -> None:
    local_only = contacts[0]

    monkeypatch.setattr(service.icloud_dao, "submit_verification_code", lambda _: None)
    monkeypatch.setattr(
        service.icloud_dao, "read_contacts_and_groups", lambda **_: ([], [])
    )
    monkeypatch.setattr(service.disk_dao, "read_contacts", lambda: [local_only])

    result = service.submit_push_code("123456")

    assert result["status"] == "review"
    assert [c["icloud_id"] for c in result["created"]] == [local_only.icloud.uuid]


def test_submit_push_code_no_changes_completes_directly(monkeypatch) -> None:
    monkeypatch.setattr(service.icloud_dao, "submit_verification_code", lambda _: None)
    monkeypatch.setattr(
        service.icloud_dao, "read_contacts_and_groups", lambda **_: ([], [])
    )
    monkeypatch.setattr(service.disk_dao, "read_contacts", lambda: [])

    result = service.submit_push_code("123456")

    assert result == {"status": "complete", "created": 0, "updated": 0}


def test_submit_push_code_wraps_failure(monkeypatch) -> None:
    def fail(_):
        raise RuntimeError("boom")

    monkeypatch.setattr(service.icloud_dao, "submit_verification_code", fail)

    with pytest.raises(service.errors.SyncError):
        service.submit_push_code("123456")


def test_apply_icloud_push_writes_only_accepted_creates(monkeypatch) -> None:
    accepted = contact_fixtures.build(name=model.Name(first_name="Accepted"))
    declined = contact_fixtures.build(name=model.Name(first_name="Declined"))
    service._pending_push = {"created": [accepted, declined], "updated": []}

    created = []
    monkeypatch.setattr(service.icloud_dao, "create_contacts", created.append)
    monkeypatch.setattr(service.icloud_dao, "update_contacts", lambda _: None)
    # _sync_etags_after_push() re-reads from iCloud/disk; nothing to refresh here.
    monkeypatch.setattr(
        service.icloud_dao, "read_contacts_and_groups", lambda **_: ([], [])
    )
    monkeypatch.setattr(service.disk_dao, "read_contacts", lambda: [])
    monkeypatch.setattr(service.disk_dao, "update_contacts", lambda _: None)

    result = service.apply_icloud_push([accepted.icloud.uuid], [])

    assert result == {"status": "complete", "created": 1, "updated": 0}
    assert created == [[accepted]]
    assert service._pending_push is None


def test_apply_icloud_push_writes_only_accepted_updates(monkeypatch, contacts) -> None:
    icloud_contact = contacts[0].copy()
    accepted_update = contacts[0].copy()
    accepted_update.notes = "accepted"
    declined_icloud_contact = contacts[1].copy()
    declined_update = contacts[1].copy()
    declined_update.notes = "declined"
    service._pending_push = {
        "created": [],
        "updated": [
            (icloud_contact, accepted_update),
            (declined_icloud_contact, declined_update),
        ],
    }

    monkeypatch.setattr(service.icloud_dao, "create_contacts", lambda _: None)
    updated = []
    monkeypatch.setattr(service.icloud_dao, "update_contacts", updated.append)
    monkeypatch.setattr(
        service.icloud_dao, "read_contacts_and_groups", lambda **_: ([], [])
    )
    monkeypatch.setattr(service.disk_dao, "read_contacts", lambda: [])
    monkeypatch.setattr(service.disk_dao, "update_contacts", lambda _: None)

    result = service.apply_icloud_push([], [accepted_update.icloud.uuid])

    assert result == {"status": "complete", "created": 0, "updated": 1}
    assert updated == [[accepted_update]]
    assert service._pending_push is None


def test_apply_icloud_push_batches_updates(monkeypatch) -> None:
    accepted = [
        contact_fixtures.build(name=model.Name(first_name=f"Contact{i}"))
        for i in range(7)
    ]
    service._pending_push = {
        "created": [],
        "updated": [(contact, contact) for contact in accepted],
    }

    batches = []
    monkeypatch.setattr(service.icloud_dao, "create_contacts", lambda _: None)
    monkeypatch.setattr(service.icloud_dao, "update_contacts", batches.append)
    monkeypatch.setattr(
        service.icloud_dao, "read_contacts_and_groups", lambda **_: ([], [])
    )
    monkeypatch.setattr(service.disk_dao, "read_contacts", lambda: [])
    monkeypatch.setattr(service.disk_dao, "update_contacts", lambda _: None)

    result = service.apply_icloud_push(
        [], [contact.icloud.uuid for contact in accepted]
    )

    assert result == {"status": "complete", "created": 0, "updated": 7}
    assert [len(batch) for batch in batches] == [5, 2]


def test_apply_icloud_push_refreshes_disk_etags(monkeypatch) -> None:
    accepted = contact_fixtures.build(name=model.Name(first_name="Pushed"))
    service._pending_push = {"created": [accepted], "updated": []}

    disk_contact = accepted.copy()
    disk_contact.id = 42
    icloud_contact_after_push = accepted.copy()
    icloud_contact_after_push.icloud.etag = "new-etag"

    monkeypatch.setattr(service.icloud_dao, "create_contacts", lambda _: None)
    monkeypatch.setattr(service.icloud_dao, "update_contacts", lambda _: None)
    monkeypatch.setattr(
        service.icloud_dao,
        "read_contacts_and_groups",
        lambda **_: ([icloud_contact_after_push], []),
    )
    monkeypatch.setattr(service.disk_dao, "read_contacts", lambda: [disk_contact])
    etag_updates = []
    monkeypatch.setattr(service.disk_dao, "update_contacts", etag_updates.append)

    service.apply_icloud_push([accepted.icloud.uuid], [])

    assert len(etag_updates) == 1
    assert etag_updates[0][0].icloud.etag == "new-etag"


def test_apply_icloud_push_declining_everything_writes_nothing(monkeypatch) -> None:
    contact = contact_fixtures.build(name=model.Name(first_name="Local"))
    service._pending_push = {"created": [contact], "updated": []}

    created = []
    monkeypatch.setattr(service.icloud_dao, "create_contacts", created.append)
    monkeypatch.setattr(service.icloud_dao, "update_contacts", lambda _: None)

    result = service.apply_icloud_push([], [])

    assert result == {"status": "complete", "created": 0, "updated": 0}
    assert created == []


def test_apply_icloud_push_without_pending_review_raises(monkeypatch) -> None:
    with pytest.raises(service.errors.ValidationError):
        service.apply_icloud_push([], [])


def test_apply_icloud_push_wraps_write_failure(monkeypatch) -> None:
    contact = contact_fixtures.build(name=model.Name(first_name="Local"))
    service._pending_push = {"created": [contact], "updated": []}

    def fail(_):
        raise RuntimeError("boom")

    monkeypatch.setattr(service.icloud_dao, "create_contacts", fail)

    with pytest.raises(service.errors.SyncError):
        service.apply_icloud_push([contact.icloud.uuid], [])
