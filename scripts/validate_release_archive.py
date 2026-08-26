#!/usr/bin/env python3
"""Validate release tar structure before extraction."""

from __future__ import annotations

import argparse
import tarfile
from pathlib import Path, PurePosixPath


def validate_archive(archive: Path, expected_root: str) -> None:
    if not expected_root or "/" in expected_root or expected_root in {".", ".."}:
        raise ValueError(f"Invalid expected archive root: {expected_root!r}")

    seen_paths: set[str] = set()
    with tarfile.open(archive, "r:gz") as bundle:
        members = bundle.getmembers()
        if not members:
            raise ValueError("Release archive is empty")

        for member in members:
            path = PurePosixPath(member.name)
            if not path.parts:
                raise ValueError(f"Empty archive path: {member.name!r}")
            if path.is_absolute() or ".." in path.parts or path.parts[0] != expected_root:
                raise ValueError(f"Unsafe or unexpected archive path: {member.name}")
            if member.name in seen_paths:
                raise ValueError(f"Duplicate archive path: {member.name}")
            seen_paths.add(member.name)
            if any(part == ".DS_Store" or part.startswith("._") for part in path.parts):
                raise ValueError(f"Platform metadata is not allowed in the release: {member.name}")
            if member.issym() or member.islnk():
                raise ValueError(f"Release archive must not contain links: {member.name}")
            if not member.isdir() and not member.isfile():
                raise ValueError(f"Release archive contains a special file: {member.name}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("archive", type=Path)
    parser.add_argument("expected_root")
    args = parser.parse_args()
    validate_archive(args.archive.resolve(strict=True), args.expected_root)


if __name__ == "__main__":
    main()
