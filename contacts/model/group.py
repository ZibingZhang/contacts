import dataclasses

from utils import dataclasses_utils


@dataclasses.dataclass
class ICloudMetadata(dataclasses_utils.DataClassJsonMixin):
    contact_uuids: list[str]
    uuid: str
    etag: str | None = None


@dataclasses.dataclass
class Group(dataclasses_utils.DataClassJsonMixin):
    icloud: ICloudMetadata
    name: str