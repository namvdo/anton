import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from scripts.write_release_smoke_evidence import build_evidence, load_import_results


class ReleaseSmokeEvidenceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)
        self.package = self.root / "bist-v0.2.0"
        (self.package / "app").mkdir(parents=True)
        self.index = self.package / "app/index.html"
        self.index.write_text("<!doctype html><title>BIST</title>\n", encoding="utf-8")
        (self.package / "BUILD_INFO.txt").write_text(
            "BIST version: 0.2.0\n"
            "Source commit: abc123\n"
            "Packaged at (UTC): 2026-08-10T00:00:00Z\n",
            encoding="utf-8",
        )
        self.archive = self.root / "bist-v0.2.0.tar.gz"
        self.archive.write_bytes(b"archive")
        self.imports = self.root / "imports.json"
        self.imports.write_text(
            json.dumps(
                {
                    "manifest": "examples/reference-experiments.txt",
                    "count": 1,
                    "experiments": [{"path": "example.json", "imported": True}],
                }
            ),
            encoding="utf-8",
        )

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def test_builds_pass_evidence_and_checks_served_bytes(self) -> None:
        evidence = build_evidence(
            archive=self.archive,
            package_directory=self.package,
            served_index=self.index,
            import_results_path=self.imports,
            network_isolation="linux-network-namespace",
        )

        self.assertEqual(evidence["status"], "passed")
        self.assertEqual(evidence["release"]["sourceCommit"], "abc123")
        self.assertEqual(
            evidence["archive"]["sha256"],
            hashlib.sha256(b"archive").hexdigest(),
        )
        self.assertEqual(
            evidence["offlineLauncher"]["servedIndexSha256"],
            hashlib.sha256(self.index.read_bytes()).hexdigest(),
        )

    def test_rejects_an_unimported_reference(self) -> None:
        self.imports.write_text(
            json.dumps({"count": 1, "experiments": [{"imported": False}]}),
            encoding="utf-8",
        )

        with self.assertRaisesRegex(ValueError, "imported=true"):
            load_import_results(self.imports)

    def test_rejects_a_launcher_response_from_another_file(self) -> None:
        served = self.root / "served.html"
        served.write_text("not the packaged app", encoding="utf-8")

        with self.assertRaisesRegex(ValueError, "did not serve"):
            build_evidence(
                archive=self.archive,
                package_directory=self.package,
                served_index=served,
                import_results_path=self.imports,
                network_isolation="linux-network-namespace",
            )


if __name__ == "__main__":
    unittest.main()
