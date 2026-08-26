#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_DIRECTORY="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMP_DIRECTORY="${REPOSITORY_DIRECTORY}/tmp/pdfs/math-documents"
OUTPUT_DIRECTORY="${REPOSITORY_DIRECTORY}/output/pdf/math"
HEADER="${REPOSITORY_DIRECTORY}/docs/latex/math-document-header.tex"

for tool in pandoc tectonic pdfinfo; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Required mathematics-document tool is missing: $tool" >&2
    exit 1
  fi
done

MARKDOWN_DOCUMENTS=(
  "docs/imperial_mastery_plan.md|imperial_mastery_plan|Imperial Visit Mastery Plan"
  "docs/imperial_collaborator_package.md|imperial_collaborator_package|Imperial Collaborator Package"
  "docs/research/extended_henon_boundary_map.md|extended_henon_boundary_map|Extended Hénon Boundary Map"
  "docs/research/wei_thesis_reproduction.md|wei_thesis_reproduction|Wei Hao Thesis Reproduction"
  "docs/research/topological_bifurcation_protocol.md|topological_bifurcation_protocol|Topological Bifurcation Protocol"
  "docs/research/master_thesis_lessons.md|master_thesis_lessons|Lessons from the Master Thesis"
  "docs/tutorials/01_henon_boundary_map.md|tutorial_henon_boundary_map|Tutorial: Hénon Boundary-Map Periodic Orbits"
  "docs/tutorials/02_geometric_offsets.md|tutorial_geometric_offsets|Tutorial: Geometric Offsets and Boundary-Map Preimages"
  "docs/tutorials/03_continuous_duffing.md|tutorial_continuous_duffing|Tutorial: Continuous Duffing Boundary Dynamics"
  "docs/scientific_validation.md|scientific_validation|BIST Scientific Validation"
  "docs/extended_state_interface.md|extended_state_interface|Extended-State Interface"
  "docs/continuation_notes.md|boundary_orbit_continuation|Boundary-Orbit Continuation"
  "docs/geometric_offset_contours.md|geometric_offset_contours|Direct Normal Projection and Inverse Curves"
  "docs/experiment_schema_v2.md|experiment_schema_v2|Experiment Schema Version 2: Mathematical and Numerical Contract"
  "docs/architecture.md|architecture|BIST Architecture"
  "docs/imperial_implementation_practice.md|imperial_implementation_practice|Imperial Mathematical Implementation Practice"
  "docs/imperial_question_bank.md|imperial_question_bank|Imperial Theory, Numerical, Rust, and WebAssembly Question Bank"
  "docs/imperial_demo.md|imperial_demo|Imperial Demonstration Script"
  "docs/imperial_rehearsal.md|imperial_rehearsal|Imperial Rehearsal and Communication Practice"
)

EXISTING_TEX_DOCUMENTS=(
  "docs/boundary_henon_continuation.tex"
  "docs/boundary_ode_viz_notes.tex"
  "docs/geometric_offset_contours.tex"
  "docs/parameterized_systems.tex"
)

mkdir -p "$TEMP_DIRECTORY" "$OUTPUT_DIRECTORY" "$OUTPUT_DIRECTORY/source_tex"

for entry in "${MARKDOWN_DOCUMENTS[@]}"; do
  IFS='|' read -r source slug title <<< "$entry"
  source_path="${REPOSITORY_DIRECTORY}/${source}"
  normalised_markdown="${TEMP_DIRECTORY}/${slug}.md"
  tex_output="${OUTPUT_DIRECTORY}/${slug}.tex"

  if [[ ! -f "$source_path" ]]; then
    echo "Mathematics source does not exist: $source" >&2
    exit 1
  fi

  python3 "${REPOSITORY_DIRECTORY}/scripts/prepare_handbook_markdown.py" \
    --output "$normalised_markdown" \
    "$source_path"

  pandoc "$normalised_markdown" \
    --from='markdown+tex_math_dollars+tex_math_single_backslash+pipe_tables+task_lists+strikeout+fenced_divs+raw_tex' \
    --to=latex \
    --standalone \
    --number-sections \
    --metadata title="$title" \
    --metadata author='Nam Do' \
    --metadata date='August 2026' \
    --metadata lang='en-GB' \
    --variable documentclass=scrartcl \
    --variable papersize=a4 \
    --variable fontsize=10pt \
    --variable geometry:margin=24mm \
    --variable colorlinks=true \
    --variable linkcolor=BistBlue \
    --variable urlcolor=BistBlue \
    --resource-path="${REPOSITORY_DIRECTORY}:${REPOSITORY_DIRECTORY}/docs:${REPOSITORY_DIRECTORY}/images:${REPOSITORY_DIRECTORY}/frontend/public" \
    --include-in-header="$HEADER" \
    --output="$tex_output"

  tectonic \
    --keep-logs \
    --keep-intermediates \
    --outdir "$OUTPUT_DIRECTORY" \
    "$tex_output"

  pdf_output="${OUTPUT_DIRECTORY}/${slug}.pdf"
  if [[ ! -s "$pdf_output" ]]; then
    echo "Mathematics PDF was not created: $pdf_output" >&2
    exit 1
  fi
done

for source in "${EXISTING_TEX_DOCUMENTS[@]}"; do
  source_path="${REPOSITORY_DIRECTORY}/${source}"
  if [[ ! -f "$source_path" ]]; then
    echo "TeX source does not exist: $source" >&2
    exit 1
  fi
  (
    cd "$(dirname "$source_path")"
    tectonic \
      --keep-logs \
      --keep-intermediates \
      --outdir "$OUTPUT_DIRECTORY/source_tex" \
      "$(basename "$source_path")"
  )
done

markdown_pdf_count="$(find "$OUTPUT_DIRECTORY" -maxdepth 1 -type f -name '*.pdf' | wc -l | tr -d ' ')"
source_tex_pdf_count="$(find "$OUTPUT_DIRECTORY/source_tex" -maxdepth 1 -type f -name '*.pdf' | wc -l | tr -d ' ')"

if [[ "$markdown_pdf_count" -ne "${#MARKDOWN_DOCUMENTS[@]}" ]]; then
  echo "Expected ${#MARKDOWN_DOCUMENTS[@]} converted Markdown PDFs, found $markdown_pdf_count." >&2
  exit 1
fi
if [[ "$source_tex_pdf_count" -ne "${#EXISTING_TEX_DOCUMENTS[@]}" ]]; then
  echo "Expected ${#EXISTING_TEX_DOCUMENTS[@]} source-TeX PDFs, found $source_tex_pdf_count." >&2
  exit 1
fi

echo "Created ${#MARKDOWN_DOCUMENTS[@]} Markdown-derived TeX/PDF pairs in $OUTPUT_DIRECTORY"
echo "Compiled ${#EXISTING_TEX_DOCUMENTS[@]} existing TeX documents in $OUTPUT_DIRECTORY/source_tex"
