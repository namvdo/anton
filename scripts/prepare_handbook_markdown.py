#!/usr/bin/env python3
r"""Prepare repository Markdown for the combined LaTeX handbook.

Older BIST notes used ordinary parentheses as informal TeX delimiters. Pandoc
correctly treats those parentheses as prose, so commands such as ``\mathsf``
would otherwise reach LaTeX outside math mode. This build-only normalisation
recognises balanced, math-like parenthetical expressions while leaving code,
links, display mathematics, and ordinary prose parentheses unchanged.
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path


TEX_COMMAND = re.compile(r"\\[A-Za-z]+")
RELATION = re.compile(r"(?:[A-Za-z0-9}\]])\s*(?:=|<|>)\s*(?:[A-Za-z0-9{[(\\-])")
SINGLE_SYMBOL = re.compile(r"[A-Za-z](?:_[A-Za-z0-9{}]+)?")
COORDINATES = re.compile(
    r"[([]?\s*[A-Za-z0-9.+-]+(?:_[A-Za-z0-9{}]+)?"
    r"(?:\s*,\s*[A-Za-z0-9.+-]+(?:_[A-Za-z0-9{}]+)?)+\s*[]) ]?"
)


def is_math_like(content: str) -> bool:
    """Return whether a balanced parenthetical group is informal TeX math."""

    stripped = content.strip()
    if not stripped or "/" in stripped and (".md" in stripped or ".rs" in stripped):
        return False
    if TEX_COMMAND.search(stripped) or RELATION.search(stripped):
        return True
    if ("_" in stripped or "^" in stripped) and not re.search(r"\s{2,}", stripped):
        return True
    if SINGLE_SYMBOL.fullmatch(stripped) or COORDINATES.fullmatch(stripped):
        return True
    if stripped.startswith("(") and stripped.endswith(")"):
        return is_math_like(stripped[1:-1])
    return False


def matching_parenthesis(text: str, start: int) -> int | None:
    depth = 0
    for index in range(start, len(text)):
        if text[index] == "(" and (index == 0 or text[index - 1] != "\\"):
            depth += 1
        elif text[index] == ")" and (index == 0 or text[index - 1] != "\\"):
            depth -= 1
            if depth == 0:
                return index
    return None


def normalise_prose(text: str) -> str:
    """Convert informal parenthetical TeX in a prose segment to ``\\(...\\)``."""

    output: list[str] = []
    cursor = 0
    while cursor < len(text):
        if text[cursor] != "(" or (cursor > 0 and text[cursor - 1] in "\\]"):
            output.append(text[cursor])
            cursor += 1
            continue
        end = matching_parenthesis(text, cursor)
        if end is None:
            output.append(text[cursor])
            cursor += 1
            continue
        content = text[cursor + 1 : end]
        if is_math_like(content):
            output.extend((r"\(", content, r"\)"))
        else:
            output.extend(("(", normalise_prose(content), ")"))
        cursor = end + 1
    return "".join(output)


def normalise_line(line: str) -> str:
    """Normalise prose while preserving inline code spans verbatim."""

    protected_span = r"(`+[^`]*`+|\\\([^\n]*?\\\)|\$[^\n$]*\$)"
    parts = re.split(protected_span, line)
    normalised: list[str] = []
    for part in parts:
        if part.startswith(("`", r"\(", "$")):
            normalised.append(part)
        else:
            normalised.append(normalise_prose(part.replace("ε", r"\(\varepsilon\)")))
    return "".join(normalised)


def normalise_document(text: str) -> str:
    """Normalise a Markdown document, excluding fenced code and display math."""

    text = text.replace("\x0b", r"\v")
    output: list[str] = []
    in_fence = False
    in_display_math = False
    fence_marker = ""

    for line in text.splitlines(keepends=True):
        stripped = line.lstrip()
        if not in_fence and (stripped.startswith("```") or stripped.startswith("~~~")):
            in_fence = True
            fence_marker = stripped[:3]
            output.append(line)
            continue
        if in_fence:
            output.append(line)
            if stripped.startswith(fence_marker):
                in_fence = False
            continue
        if stripped.startswith(r"\["):
            in_display_math = True
            output.append(line)
            continue
        if in_display_math:
            output.append(line)
            if stripped.startswith(r"\]"):
                in_display_math = False
            continue
        output.append(normalise_line(line))

    if in_fence or in_display_math:
        raise ValueError("Unclosed Markdown fence or display-math block")
    return "".join(output)


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("sources", nargs="+", type=Path)
    return parser.parse_args()


def main() -> None:
    arguments = parse_arguments()
    sections: list[str] = []
    for source in arguments.sources:
        if not source.is_file():
            raise FileNotFoundError(f"Handbook source does not exist: {source}")
        content = source.read_text(encoding="utf-8")
        sections.append(f"<!-- handbook-source: {source} -->\n\n")
        sections.append(normalise_document(content).rstrip())
        sections.append("\n\n\\newpage\n\n")

    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text("".join(sections), encoding="utf-8")


if __name__ == "__main__":
    main()
