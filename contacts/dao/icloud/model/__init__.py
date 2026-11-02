"""iCloud request and response models."""
from contacts.dao.icloud.model import icloud_contact, icloud_group

__all__ = [
    "ICloudContact",
    "ICloudGroup",
    "Date",
    "EmailAddress",
    "IMField",
    "IM",
    "Phone",
    "Photo",
    "PhotoCrop",
    "Profile",
    "RelatedName",
    "StreetAddressField",
    "StreetAddress",
    "Url",
]

ICloudContact = icloud_contact.ICloudContact
ICloudGroup = icloud_group.ICloudGroup

Date = icloud_contact.Date
EmailAddress = icloud_contact.EmailAddress
IMField = icloud_contact.IMField
IM = icloud_contact.IM
Phone = icloud_contact.Phone
Photo = icloud_contact.Photo
PhotoCrop = icloud_contact.PhotoCrop
Profile = icloud_contact.Profile
RelatedName = icloud_contact.RelatedName
StreetAddressField = icloud_contact.StreetAddressField
StreetAddress = icloud_contact.StreetAddress
Url = icloud_contact.Url
