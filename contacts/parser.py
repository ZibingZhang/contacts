"""Parse command line arguments."""
from __future__ import annotations

import argparse

from contacts import command


def parse_arguments() -> argparse.Namespace:
    return _create_parser().parse_args()


def _create_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        formatter_class=argparse.ArgumentDefaultsHelpFormatter
    )

    command_parser = parser.add_subparsers(
        dest="command",
        required=True,
        help="commands",
    )

    _build_families_command_parser(command_parser)
    _build_pull_command_parser(command_parser)
    _build_push_command_parser(command_parser)
    _build_tag_command_parser(command_parser)
    _build_sync_groups_command_parser(command_parser)
    _build_validate_command_parser(command_parser)

    return parser


def _build_add_command_parser(command_parser: argparse._SubParsersAction) -> None:
    command_parser.add_parser(
        command.Command.ADD.value,
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
        help="add a contact",
    )


def _build_dump_command_parser(command_parser: argparse._SubParsersAction) -> None:
    command_parser.add_parser(
        command.Command.DUMP.value,
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
        help="dump a contact",
    )


def _build_families_command_parser(command_parser: argparse._SubParsersAction) -> None:
    command_parser.add_parser(
        command.Command.FAMILIES.value,
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
        help="view all families",
    )


def _build_load_command_parser(command_parser: argparse._SubParsersAction) -> None:
    load_parser = command_parser.add_parser(
        command.Command.LOAD.value,
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
        help="load a contact",
    )
    load_parser.add_argument("name", nargs="?")


def _build_pull_command_parser(command_parser: argparse._SubParsersAction) -> None:
    pull_parser = command_parser.add_parser(
        command.Command.PULL.value,
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
        help="pull contacts from remote source",
    )
    pull_parser.add_argument(
        "--cached", action="store_true", default=False, help="pull contacts from cache"
    )


def _build_push_command_parser(command_parser: argparse._SubParsersAction) -> None:
    push_parser = command_parser.add_parser(
        command.Command.PUSH.value,
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
        help="push contacts to remote source",
    )
    push_parser.add_argument(
        "--force",
        action="store_true",
        default=False,
        help="perform the action user validation",
    )
    push_parser.add_argument(
        "--write",
        action="store_true",
        default=False,
        help="write the contact creations / updates",
    )


def _build_sync_groups_command_parser(
    command_parser: argparse._SubParsersAction,
) -> None:
    command_parser.add_parser(
        command.Command.SYNC_GROUPS.value,
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
        help="sync contact groups",
    )


def _build_tag_command_parser(command_parser: argparse._SubParsersAction) -> None:
    tag_parser = command_parser.add_parser(
        command.Command.TAG.value,
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
        help="tag contacts",
    )

    tag_action_parser = tag_parser.add_subparsers(dest="tag_action", help="tag actions")

    ls_tag_action_parser = tag_action_parser.add_parser(
        command.TagSubcommand.LS, help="list all tags"
    )
    ls_tag_action_parser.add_argument("tags", nargs="*")

    mv_tag_action_parser = tag_action_parser.add_parser(
        command.TagSubcommand.MV, help="rename a tag"
    )
    mv_tag_action_parser.add_argument(
        "old",
    )
    mv_tag_action_parser.add_argument(
        "new",
    )

    tag_action_parser.add_parser(
        command.TagSubcommand.REPL, help="repl to add tags to contacts"
    )


def _build_validate_command_parser(command_parser: argparse._SubParsersAction) -> None:
    validate_parser = command_parser.add_parser(
        command.Command.VALIDATE.value,
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
        help="validate contacts",
    )
    validate_parser.add_argument(
        "--fix",
        action="store_true",
        default=False,
        help="fix the validation errors",
    )
