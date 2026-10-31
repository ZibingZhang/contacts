"""Command line commands."""

import enum

from contacts.command import (
    add,
    birthday,
    families,
    migrate_contacts_to_sqlite,
    pull,
    push,
    serve,
    sync_groups,
    tag_ls,
    tag_mv,
    tag_repl,
    tsv_dump,
    tsv_load,
    validate,
)


class Command(enum.StrEnum):
    ADD = "add"
    BIRTHDAY = "birthday"
    FAMILIES = "families"
    MIGRATE_CONTACTS_TO_SQLITE = "migrate-contacts-to-sqlite"
    PULL = "pull"
    PUSH = "push"
    SERVE = "serve"
    SYNC_GROUPS = "sync-groups"
    TAG = "tag"
    TSV = "tsv"
    VALIDATE = "validate"


class TagSubcommand(enum.StrEnum):
    LS = "ls"
    MV = "mv"
    REPL = "repl"


class TsvSubcommand(enum.StrEnum):
    DUMP = "dump"
    LOAD = "load"
