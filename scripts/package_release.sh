#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASE_DIRECTORY="${REPOSITORY_DIRECTORY}/release"
SKIP_VERIFY=false

if [[ "${1:-}" == "--skip-verify" ]]; then
  SKIP_VERIFY=true
elif [[ $# -gt 0 ]]; then
  echo "Usage: $0 [--skip-verify]" >&2
  exit 2
fi

VERSION="$(awk -F '"' '/^version = "/ { print $2; exit }' "${REPOSITORY_DIRECTORY}/Cargo.toml")"
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([+-][0-9A-Za-z.-]+)?$ ]]; then
  echo "Could not read a valid semantic version from Cargo.toml." >&2
  exit 1
fi

PACKAGE_NAME="bist-v${VERSION}"
PACKAGE_ROOT="${RELEASE_DIRECTORY}/${PACKAGE_NAME}"
ARCHIVE_TAR="${RELEASE_DIRECTORY}/${PACKAGE_NAME}.tar.gz"
ARCHIVE_ZIP="${RELEASE_DIRECTORY}/${PACKAGE_NAME}.zip"

if [[ "$SKIP_VERIFY" == false ]]; then
  "${REPOSITORY_DIRECTORY}/scripts/verify.sh"
fi

COMMIT="$(git -C "$REPOSITORY_DIRECTORY" rev-parse --short=12 HEAD)"
if ! git -C "$REPOSITORY_DIRECTORY" diff --quiet \
  || ! git -C "$REPOSITORY_DIRECTORY" diff --cached --quiet \
  || [[ -n "$(git -C "$REPOSITORY_DIRECTORY" ls-files --others --exclude-standard)" ]]; then
  COMMIT="${COMMIT}-dirty"
fi
(
  cd "${REPOSITORY_DIRECTORY}/frontend"
  VITE_GIT_COMMIT="$COMMIT" npm run build
)

mkdir -p "$RELEASE_DIRECTORY"
if [[ "$PACKAGE_ROOT" != "${RELEASE_DIRECTORY}/bist-v${VERSION}" ]]; then
  echo "Refusing to replace an unexpected package path." >&2
  exit 1
fi
rm -rf "$PACKAGE_ROOT"
rm -f "$ARCHIVE_TAR" "$ARCHIVE_ZIP"

mkdir -p "$PACKAGE_ROOT/docs/tutorials" "$PACKAGE_ROOT/docs/research" "$PACKAGE_ROOT/docs/images" "$PACKAGE_ROOT/examples" "$PACKAGE_ROOT/schemas" "$PACKAGE_ROOT/validation"
cp -R "${REPOSITORY_DIRECTORY}/frontend/dist" "$PACKAGE_ROOT/app"
cp "${REPOSITORY_DIRECTORY}/packaging/START_HERE.md" "$PACKAGE_ROOT/START_HERE.md"
cp "${REPOSITORY_DIRECTORY}/packaging/start-bist.sh" "$PACKAGE_ROOT/start-bist.sh"
cp "${REPOSITORY_DIRECTORY}/README.md" "$PACKAGE_ROOT/README.md"
cp "${REPOSITORY_DIRECTORY}/LICENSE" "$PACKAGE_ROOT/LICENSE"
cp "${REPOSITORY_DIRECTORY}/CITATION.cff" "$PACKAGE_ROOT/CITATION.cff"
cp "${REPOSITORY_DIRECTORY}/CHANGELOG.md" "$PACKAGE_ROOT/CHANGELOG.md"
cp "${REPOSITORY_DIRECTORY}/RELEASE_NOTES.md" "$PACKAGE_ROOT/RELEASE_NOTES.md"
cp "${REPOSITORY_DIRECTORY}/docs/"*.md "$PACKAGE_ROOT/docs/"
cp "${REPOSITORY_DIRECTORY}/docs/tutorials/"*.md "$PACKAGE_ROOT/docs/tutorials/"
cp "${REPOSITORY_DIRECTORY}/docs/research/"*.md "$PACKAGE_ROOT/docs/research/"
cp -R "${REPOSITORY_DIRECTORY}/examples/." "$PACKAGE_ROOT/examples/"
cp "${REPOSITORY_DIRECTORY}/schemas/"*.json "$PACKAGE_ROOT/schemas/"
cp "${REPOSITORY_DIRECTORY}/validation/reference_results.json" "$PACKAGE_ROOT/validation/reference_results.json"
cp "${REPOSITORY_DIRECTORY}/validation/wei_reproduction_smoke.json" "$PACKAGE_ROOT/validation/wei_reproduction_smoke.json"
cp "${REPOSITORY_DIRECTORY}/validation/wei_reproduction_reference.json" "$PACKAGE_ROOT/validation/wei_reproduction_reference.json"
cp "${REPOSITORY_DIRECTORY}/validation/wei_thesis_targets.json" "$PACKAGE_ROOT/validation/wei_thesis_targets.json"
if [[ -f "${REPOSITORY_DIRECTORY}/docs/bist_technical_report_24042026.pdf" ]]; then
  cp "${REPOSITORY_DIRECTORY}/docs/bist_technical_report_24042026.pdf" "$PACKAGE_ROOT/docs/"
fi
if [[ -f "${REPOSITORY_DIRECTORY}/output/pdf/bist_imperial_handbook.pdf" ]]; then
  cp "${REPOSITORY_DIRECTORY}/output/pdf/bist_imperial_handbook.pdf" "$PACKAGE_ROOT/docs/"
fi
if [[ -f "${REPOSITORY_DIRECTORY}/output/pdf/bist_imperial_handbook.tex" ]]; then
  cp "${REPOSITORY_DIRECTORY}/output/pdf/bist_imperial_handbook.tex" "$PACKAGE_ROOT/docs/"
fi
if [[ -d "${REPOSITORY_DIRECTORY}/output/pdf/math" ]]; then
  mkdir -p "$PACKAGE_ROOT/docs/math"
  cp -R "${REPOSITORY_DIRECTORY}/output/pdf/math/." "$PACKAGE_ROOT/docs/math/"
fi
cp "${REPOSITORY_DIRECTORY}/images/unstable_manifold_for_boundary_map.png" "$PACKAGE_ROOT/docs/images/"

# Finder metadata is not part of the release, even when it exists in an ignored source path.
find "$PACKAGE_ROOT" -type f -name '.DS_Store' -delete

printf 'BIST version: %s\nSource commit: %s\nPackaged at (UTC): %s\n' \
  "$VERSION" "$COMMIT" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$PACKAGE_ROOT/BUILD_INFO.txt"

chmod +x "$PACKAGE_ROOT/start-bist.sh"
COPYFILE_DISABLE=1 LC_ALL=C LANG=C tar -C "$RELEASE_DIRECTORY" -czf "$ARCHIVE_TAR" "$PACKAGE_NAME"
(
  cd "$RELEASE_DIRECTORY"
  python3 -m zipfile -c "${PACKAGE_NAME}.zip" "$PACKAGE_NAME"
)

if command -v shasum >/dev/null 2>&1; then
  (
    cd "$RELEASE_DIRECTORY"
    LC_ALL=C LANG=C shasum -a 256 "${PACKAGE_NAME}.tar.gz" "${PACKAGE_NAME}.zip" > "${PACKAGE_NAME}.sha256"
  )
else
  (
    cd "$RELEASE_DIRECTORY"
    LC_ALL=C LANG=C sha256sum "${PACKAGE_NAME}.tar.gz" "${PACKAGE_NAME}.zip" > "${PACKAGE_NAME}.sha256"
  )
fi

echo "Created release archives:"
echo "  ${ARCHIVE_TAR}"
echo "  ${ARCHIVE_ZIP}"
echo "  ${RELEASE_DIRECTORY}/${PACKAGE_NAME}.sha256"
