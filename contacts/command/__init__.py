"""Command line commands."""
import enum

from contacts.command import (
    families,
    pull,
    push,
    sync_groups,
    tag_ls,
    tag_mv,
    tag_repl,
    validate,
)


class Command(enum.StrEnum):
    ADD = "add"
    DUMP = "dump"
    FAMILIES = "families"
    LOAD = "load"
    PULL = "pull"
    PUSH = "push"
    SYNC_GROUPS = "sync-groups"
    TAG = "tag"
    VALIDATE = "validate"


class TagSubcommand(enum.StrEnum):
    LS = "ls"
    MV = "mv"
    REPL = "repl"
