import io
import tarfile
import tempfile
import unittest
from pathlib import Path

from scripts.validate_release_archive import validate_archive


class ReleaseArchiveValidationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.archive = Path(self.temporary_directory.name) / "release.tar.gz"

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def write_archive(self, members: list[tuple[tarfile.TarInfo, bytes]]) -> None:
        with tarfile.open(self.archive, "w:gz") as bundle:
            for member, contents in members:
                member.size = len(contents)
                bundle.addfile(member, io.BytesIO(contents))

    def test_accepts_regular_files_under_one_root(self) -> None:
        self.write_archive(
            [
                (tarfile.TarInfo("bist-v0.2.0/README.md"), b"BIST\n"),
                (tarfile.TarInfo("bist-v0.2.0/app/index.html"), b"<html>\n"),
            ]
        )

        validate_archive(self.archive, "bist-v0.2.0")

    def test_rejects_path_traversal(self) -> None:
        self.write_archive([(tarfile.TarInfo("bist-v0.2.0/../escape"), b"bad")])

        with self.assertRaisesRegex(ValueError, "Unsafe"):
            validate_archive(self.archive, "bist-v0.2.0")

    def test_rejects_platform_metadata(self) -> None:
        self.write_archive([(tarfile.TarInfo("bist-v0.2.0/.DS_Store"), b"bad")])

        with self.assertRaisesRegex(ValueError, "Platform metadata"):
            validate_archive(self.archive, "bist-v0.2.0")

    def test_rejects_links(self) -> None:
        link = tarfile.TarInfo("bist-v0.2.0/app-link")
        link.type = tarfile.SYMTYPE
        link.linkname = "/tmp/app"
        self.write_archive([(link, b"")])

        with self.assertRaisesRegex(ValueError, "must not contain links"):
            validate_archive(self.archive, "bist-v0.2.0")


if __name__ == "__main__":
    unittest.main()
