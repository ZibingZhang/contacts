from contacts.dao.disk.disk_dao import DiskDao
from contacts.dao.icloud.icloud_dao import ICloudDao

__all__ = ["icloud_dao", "disk_dao"]

icloud_dao = ICloudDao()

# Constructing this does nothing on its own -- call `disk_dao.initialize()` to
# create and migrate the database. Importing must stay side-effect free,
# because the migration to the `object` table is one way.
disk_dao = DiskDao()
