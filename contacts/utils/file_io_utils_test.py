"""Tests for contacts.utils.file_io_utils."""
from __future__ import annotations

import os.path

from contacts.dao.icloud import model as icloud_model
from contacts.utils import file_io_utils, uuid_utils


def test_reading_and_writing_dataclasses_are_inverses(tmp_path) -> None:
    written_objects = [
        icloud_model.Phone(field="+11234", label="HOME"),
        icloud_model.Phone(field="+865678", label="WORK"),
    ]
    file_path = str(tmp_path / uuid_utils.generate())

    file_io_utils.write_dataclass_objects_as_json_array(
        path=file_path, objects=written_objects
    )
    read_objects = file_io_utils.read_json_array_as_dataclass_objects(
        path=file_path, cls=icloud_model.Phone
    )

    assert written_objects == read_objects


def test_read_json_array_reads_plain_dicts(tmp_path) -> None:
    file_path = str(tmp_path / "objects.json")
    with open(file_path, "w", encoding="utf-8") as f:
        f.write('[{"name": {"first_name": "Ada"}}, {"name": {}}]')

    read_objects = file_io_utils.read_json_array(file_path)

    assert read_objects == [{"name": {"first_name": "Ada"}}, {"name": {}}]


def test_written_json_array_is_valid_on_disk(tmp_path) -> None:
    file_path = str(tmp_path / "phones.json")

    file_io_utils.write_dataclass_objects_as_json_array(
        path=file_path, objects=[icloud_model.Phone(field="+11234")]
    )

    assert os.path.isfile(file_path)
    assert file_io_utils.read_json_array(file_path) == [{"field": "+11234"}]
