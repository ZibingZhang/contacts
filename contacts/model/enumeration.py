"""Various enumerations."""

import enum
import functools


class Country(enum.StrEnum):
    IRELAND = "Ireland"
    UNITED_STATES = "United States"

    @staticmethod
    @functools.cache
    def values() -> list[str]:
        return [item for item in Country]

    @staticmethod
    @functools.cache
    def labeled_values() -> list[dict]:
        return [{"value": item.value, "label": item.value} for item in Country]


class CountryCode(enum.IntEnum):
    NANP = 1
    PORTUGAL = 351
    IRELAND = 353
    CROATIA = 385
    UNITED_KINGDOM = 44
    BELGIUM = 32
    SWEDEN = 46
    BRAZIL = 55
    CHILE = 56
    MALAYSIA = 60
    MEXICO = 52
    RUSSIA = 7
    HONG_KONG = 852
    CHINA = 86
    TAIWAN = 886

    @staticmethod
    @functools.cache
    def values() -> list[int]:
        return [item for item in CountryCode]

    @staticmethod
    @functools.cache
    def labeled_values() -> list[dict]:
        return [
            {
                "value": int(code),
                "label": (
                    "United States/Canada"
                    if code is CountryCode.NANP
                    else code.name.replace("_", " ").title()
                ),
            }
            for code in CountryCode
        ]
