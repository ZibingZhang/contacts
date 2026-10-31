"""Tests for contacts.dao.disk.disk_dao."""

from __future__ import annotations

import pytest

from contacts import model
from contacts.dao.disk.disk_dao import DiskDao
from contacts.fixtures import contact_fixtures


@pytest.fixture(autouse=True)
def _disk_dao(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(DiskDao, "PATH", str(tmp_path / "contacts.db"))
    DiskDao()


def test_create_contacts_assigns_id_starting_from_one_on_empty_table() -> None:
    contact = contact_fixtures.build(name=model.Name(first_name="John"))

    DiskDao.create_contacts([contact])

    assert contact.id == 1


def test_create_contacts_continues_from_existing_max_id() -> None:
    DiskDao.create_contacts(
        [contact_fixtures.build(name=model.Name(first_name="John"))]
    )
    second = contact_fixtures.build(name=model.Name(first_name="Jane"))

    DiskDao.create_contacts([second])

    assert second.id == 2


def test_create_contacts_assigns_sequential_ids_within_one_call() -> None:
    first = contact_fixtures.build(name=model.Name(first_name="John"))
    second = contact_fixtures.build(name=model.Name(first_name="Jane"))

    DiskDao.create_contacts([first, second])

    assert (first.id, second.id) == (1, 2)


def test_create_contacts_sets_ctime_and_mtime() -> None:
    contact = contact_fixtures.build(name=model.Name(first_name="John"))

    DiskDao.create_contacts([contact])

    assert contact.ctime is not None
    assert contact.ctime == contact.mtime


def test_update_contacts_overwrites_in_place_without_duplicating() -> None:
    contact = contact_fixtures.build(name=model.Name(first_name="John"))
    DiskDao.create_contacts([contact])

    contact.name.first_name = "Jonathan"
    DiskDao.update_contacts([contact])

    contacts = DiskDao.read_contacts()
    assert len(contacts) == 1
    assert contacts[0].name.first_name == "Jonathan"


def test_update_contacts_preserves_original_ctime() -> None:
    contact = contact_fixtures.build(name=model.Name(first_name="John"))
    DiskDao.create_contacts([contact])
    original_ctime = contact.ctime

    contact.mtime = original_ctime + 100
    DiskDao.update_contacts([contact])

    [read_back] = DiskDao.read_contacts()
    assert read_back.ctime == original_ctime
    assert read_back.mtime == original_ctime + 100


def test_read_contacts_round_trips_nested_fields() -> None:
    contact = contact_fixtures.build(
        name=model.Name(first_name="John", last_name="Smith"),
        education=model.Education(
            high_school=model.HighSchool(
                name="Acton-Boxborough", graduation_year=2016
            ),
            bachelor=model.University(
                name="Bowdoin", graduation_year=2019, majors=["CS"]
            ),
        ),
        phone_numbers=[model.PhoneNumber(number="9787276511")],
        social_profiles=model.SocialProfiles(
            instagram=model.InstagramProfile(username="purplecoral99")
        ),
        tags=["Boston"],
    )
    DiskDao.create_contacts([contact])

    [read_back] = DiskDao.read_contacts()

    assert read_back.to_dict() == contact.to_dict()


def test_read_contacts_backfills_missing_mtime() -> None:
    contact = contact_fixtures.build(name=model.Name(first_name="John"))
    DiskDao.create_contacts([contact])
    contact.mtime = None
    DiskDao.update_contacts([contact])

    [read_back] = DiskDao.read_contacts()

    assert read_back.mtime is not None


def test_read_contacts_backfills_missing_icloud() -> None:
    contact = contact_fixtures.build(name=model.Name(first_name="John"))
    DiskDao.create_contacts([contact])
    contact.icloud = None
    DiskDao.update_contacts([contact])

    [read_back] = DiskDao.read_contacts()

    assert read_back.icloud is not None
