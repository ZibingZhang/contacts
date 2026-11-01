"""The model for a contact group."""
from __future__ import annotations

import dataclasses

from contacts.utils import dataclasses_utils


@dataclasses.dataclass(repr=False)
class ICloudGroupMetadata(dataclasses_utils.DataClassJsonMixin):
    uuid: str
    etag: str | None = None


@dataclasses.dataclass(repr=False)
class Group(dataclasses_utils.DataClassJsonMixin):
    # Required
    name: str
    query: str

    # Unique id
    id: int | None = None

    # Contact ids matching `query`, as of the last refresh
    ids: list[int] | None = None

    # Whether to sync this group to iCloud as a contact group
    sync: bool = False

    # Meta information
    ctime: float | None = None
    mtime: float | None = None

    # iCloud specific
    icloud: ICloudGroupMetadata | None = None


class DiskGroup(Group):
    id: int
