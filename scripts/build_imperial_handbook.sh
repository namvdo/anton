#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMP_DIRECTORY="${REPOSITORY_DIRECTORY}/tmp/pdfs"
OUTPUT_DIRECTORY="${REPOSITORY_DIRECTORY}/output/pdf"
MANIFEST="${TEMP_DIRECTORY}/bist_imperial_handbook_manifest.md"
COMBINED_MARKDOWN="${TEMP_DIRECTORY}/bist_imperial_handbook.md"
TEX_OUTPUT="${OUTPUT_DIRECTORY}/bist_imperial_handbook.tex"

for tool in pandoc tectonic pdftoppm pdfinfo; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Required documentation tool is missing: $tool" >&2
    exit 1
  fi
done

SOURCES=(
  "README.md"
  "frontend/README.md"
  "docs/imperial_collaborator_package.md"
  "docs/imperial_mastery_plan.md"
  "docs/imperial_implementation_practice.md"
  "docs/imperial_question_bank.md"
  "docs/research/extended_henon_boundary_map.md"
  "docs/research/wei_thesis_reproduction.md"
  "docs/research/topological_bifurcation_protocol.md"
  "docs/research/master_thesis_lessons.md"
  "docs/tutorials/01_henon_boundary_map.md"
  "docs/tutorials/02_geometric_offsets.md"
  "docs/tutorials/03_continuous_duffing.md"
  "docs/scientific_validation.md"
  "docs/extended_state_interface.md"
  "docs/continuation_notes.md"
  "docs/geometric_offset_contours.md"
  "docs/experiment_schema_v2.md"
  "docs/architecture.md"
  "docs/gui_design_system.md"
  "docs/extension_guide.md"
  "docs/quickstart.md"
  "docs/troubleshooting.md"
  "docs/release_checklist.md"
  "docs/release_smoke_test.md"
  "docs/imperial_demo.md"
  "docs/imperial_rehearsal.md"
  "CONTRIBUTING.md"
  "RELEASE_NOTES.md"
  "CHANGELOG.md"
  "packaging/START_HERE.md"
  "examples/README.md"
  "docs/project_notes.md"
  "py/README.md"
)

cd "$REPOSITORY_DIRECTORY"
mkdir -p "$TEMP_DIRECTORY" "$OUTPUT_DIRECTORY"
mkdir -p "$OUTPUT_DIRECTORY/images" "$OUTPUT_DIRECTORY/frontend/public"
cp "${REPOSITORY_DIRECTORY}/images/"*.png "$OUTPUT_DIRECTORY/images/"
cp "${REPOSITORY_DIRECTORY}/frontend/public/"*.png "$OUTPUT_DIRECTORY/frontend/public/"

DISCOVERED_LIST="${TEMP_DIRECTORY}/handbook_discovered_sources.txt"
DECLARED_LIST="${TEMP_DIRECTORY}/handbook_declared_sources.txt"
{
  {
    find . -maxdepth 1 -type f -name '*.md' -print
    find docs -type f -name '*.md' -print
    find packaging -type f -name '*.md' -print
    find examples -maxdepth 1 -type f -name '*.md' -print
    find frontend -maxdepth 1 -type f -name '*.md' -print
    find py -maxdepth 1 -type f -name '*.md' -print
  } | sed 's#^\./##' | LC_ALL=C sort
} > "$DISCOVERED_LIST"
printf '%s\n' "${SOURCES[@]}" | LC_ALL=C sort > "$DECLARED_LIST"

if ! diff -u "$DISCOVERED_LIST" "$DECLARED_LIST"; then
  echo "The handbook source list does not match the authored Markdown inventory." >&2
  exit 1
fi

{
  printf '# Documentation source manifest\n\n'
  printf 'This handbook was generated from the following repository-authored Markdown files. '
  printf 'Generated packages, dependencies, build output, and caches are intentionally excluded.\n\n'
  for source in "${SOURCES[@]}"; do
    printf -- '- `%s`\n' "$source"
  done
} > "$MANIFEST"

python3 scripts/prepare_handbook_markdown.py \
  --output "$COMBINED_MARKDOWN" \
  "${SOURCES[@]}" \
  "$MANIFEST"

pandoc "$COMBINED_MARKDOWN" \
  --from='markdown+tex_math_dollars+tex_math_single_backslash+pipe_tables+task_lists+strikeout+fenced_divs+raw_tex' \
  --to=latex \
  --standalone \
  --file-scope \
  --top-level-division=chapter \
  --number-sections \
  --table-of-contents \
  --metadata title='BIST Imperial College London Preparation Handbook' \
  --metadata subtitle='Extended boundary maps, reproducible software, implementation practice, and visit preparation' \
  --metadata author='Nam Do' \
  --metadata date='August 2026' \
  --metadata lang='en-GB' \
  --variable documentclass=scrreprt \
  --variable classoption=oneside \
  --variable papersize=a4 \
  --variable fontsize=10pt \
  --variable geometry:margin=24mm \
  --variable colorlinks=true \
  --variable linkcolor=BistBlue \
  --variable urlcolor=BistBlue \
  --resource-path="${REPOSITORY_DIRECTORY}:${REPOSITORY_DIRECTORY}/docs:${REPOSITORY_DIRECTORY}/images:${REPOSITORY_DIRECTORY}/frontend/public" \
  --include-in-header="${REPOSITORY_DIRECTORY}/docs/latex/handbook-header.tex" \
  --output="$TEX_OUTPUT"

tectonic \
  --keep-logs \
  --keep-intermediates \
  --outdir "$OUTPUT_DIRECTORY" \
  "$TEX_OUTPUT"

PDF_OUTPUT="${OUTPUT_DIRECTORY}/bist_imperial_handbook.pdf"
if [[ ! -s "$PDF_OUTPUT" ]]; then
  echo "Handbook PDF was not created." >&2
  exit 1
fi

pdfinfo "$PDF_OUTPUT" | sed -n '1,18p'
echo "Created $TEX_OUTPUT"
echo "Created $PDF_OUTPUT"
