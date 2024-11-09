from contacts.dao.icloud.icloud_dao import ICloudDao
from contacts.dao.disk.disk_dao import DiskDao

__all__ = ["icloud_dao", "disk_dao"]

icloud_dao = ICloudDao()
disk_dao = DiskDao()
