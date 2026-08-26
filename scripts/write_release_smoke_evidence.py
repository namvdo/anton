#!/usr/bin/env python3
"""Build the machine-readable evidence record for the offline release smoke test."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


EVIDENCE_SCHEMA = "bist-release-smoke-evidence"
EVIDENCE_SCHEMA_VERSION = 1


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_build_info(path: Path) -> dict[str, str]:
    fields: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        key, separator, value = raw_line.partition(":")
        if not separator or not value.strip():
            raise ValueError(f"Malformed build-info line: {raw_line!r}")
        fields[key.strip()] = value.strip()

    required = {"BIST version", "Source commit", "Packaged at (UTC)"}
    missing = required.difference(fields)
    if missing:
        raise ValueError(f"Build info is missing: {', '.join(sorted(missing))}")
    return fields


def load_import_results(path: Path) -> dict[str, Any]:
    value: object = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("Import results must be a JSON object")
    experiments = value.get("experiments")
    if not isinstance(experiments, list) or not experiments:
        raise ValueError("Import results must contain at least one experiment")
    if value.get("count") != len(experiments):
        raise ValueError("Import result count does not match its experiment list")
    if any(not isinstance(item, dict) or item.get("imported") is not True for item in experiments):
        raise ValueError("Every reference experiment must report imported=true")
    return value


def build_evidence(
    *,
    archive: Path,
    package_directory: Path,
    served_index: Path,
    import_results_path: Path,
    network_isolation: str,
) -> dict[str, Any]:
    build_info = parse_build_info(package_directory / "BUILD_INFO.txt")
    import_results = load_import_results(import_results_path)
    packaged_index = package_directory / "app/index.html"

    served_hash = sha256_file(served_index)
    packaged_hash = sha256_file(packaged_index)
    if served_hash != packaged_hash:
        raise ValueError("The launcher did not serve the packaged app/index.html")

    return {
        "schema": EVIDENCE_SCHEMA,
        "schemaVersion": EVIDENCE_SCHEMA_VERSION,
        "status": "passed",
        "generatedAtUtc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "release": {
            "version": build_info["BIST version"],
            "sourceCommit": build_info["Source commit"],
            "packagedAtUtc": build_info["Packaged at (UTC)"],
        },
        "archive": {
            "name": archive.name,
            "format": "tar.gz",
            "sha256": sha256_file(archive),
            "unpackedIntoIsolatedTemporaryDirectory": True,
        },
        "offlineLauncher": {
            "command": "./start-bist.sh <ephemeral-port>",
            "bindAddress": "127.0.0.1",
            "networkIsolation": network_isolation,
            "servedPath": "app/index.html",
            "servedIndexSha256": served_hash,
        },
        "referenceExperimentImports": import_results,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", required=True, type=Path)
    parser.add_argument("--package-directory", required=True, type=Path)
    parser.add_argument("--served-index", required=True, type=Path)
    parser.add_argument("--import-results", required=True, type=Path)
    parser.add_argument("--network-isolation", required=True)
    parser.add_argument("--output", required=True, type=Path)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    evidence = build_evidence(
        archive=args.archive.resolve(strict=True),
        package_directory=args.package_directory.resolve(strict=True),
        served_index=args.served_index.resolve(strict=True),
        import_results_path=args.import_results.resolve(strict=True),
        network_isolation=args.network_isolation,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary_output = args.output.with_suffix(f"{args.output.suffix}.tmp")
    temporary_output.write_text(f"{json.dumps(evidence, indent=2)}\n", encoding="utf-8")
    temporary_output.replace(args.output)


if __name__ == "__main__":
    main()
