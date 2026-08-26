from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "prepare_handbook_markdown.py"
SPEC = importlib.util.spec_from_file_location("prepare_handbook_markdown", SCRIPT)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Cannot import {SCRIPT}")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class PrepareHandbookMarkdownTests(unittest.TestCase):
    def test_normalises_math_but_preserves_prose_links_and_code(self) -> None:
        source = (
            "The state ((x,y)) uses (b=0.3) and "
            "((DH^\\mathsf{T})^{-1}n). Keep (a short note), "
            "[a file](some_file.md), and `call(x_y)` unchanged.\n"
        )
        expected = (
            "The state \\((x,y)\\) uses \\(b=0.3\\) and "
            "\\((DH^\\mathsf{T})^{-1}n\\). Keep (a short note), "
            "[a file](some_file.md), and `call(x_y)` unchanged.\n"
        )
        self.assertEqual(MODULE.normalise_document(source), expected)

    def test_preserves_fenced_and_display_math(self) -> None:
        source = (
            "Already \\((n_x,n_y)\\) and $a_b$ stay inline.\n"
            "```rust\nfn f(x_y: f64) {}\n```\n\\[\nf(x)=(x,y)\n\\]\n"
        )
        self.assertEqual(MODULE.normalise_document(source), source)

    def test_converts_unicode_epsilon_outside_code(self) -> None:
        self.assertEqual(
            MODULE.normalise_document("Choose **Contour ε** and `ε`.\n"),
            "Choose **Contour \\(\\varepsilon\\)** and `ε`.\n",
        )

    def test_repairs_vertical_tab_from_a_literal_varepsilon(self) -> None:
        self.assertEqual(
            MODULE.normalise_document("Use (\x0barepsilon=0.1).\n"),
            "Use \\(\\varepsilon=0.1\\).\n",
        )

    def test_rejects_unclosed_blocks(self) -> None:
        with self.assertRaises(ValueError):
            MODULE.normalise_document("```rust\nfn f() {}\n")


if __name__ == "__main__":
    unittest.main()
