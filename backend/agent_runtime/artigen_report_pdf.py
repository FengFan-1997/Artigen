#!/usr/bin/env python3
"""Render a small Markdown/plain-text report to PDF with bundled ReportLab."""

from __future__ import annotations

import html
import os
import re
import sys
from pathlib import Path

from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import ListFlowable, ListItem, Paragraph, SimpleDocTemplate, Spacer


MAX_INPUT_BYTES = 4 * 1024 * 1024


def usage() -> None:
    print("usage: artigen-report-pdf INPUT.md OUTPUT.pdf", file=sys.stderr)


def safe_paths(source: str, output: str) -> tuple[Path, Path]:
    workspace = Path("/tmp/artigen-workspace").resolve()
    source_path = Path(source).resolve(strict=True)
    output_path = Path(output).resolve()
    if workspace not in source_path.parents or workspace not in output_path.parents:
        raise ValueError("paths must stay inside /tmp/artigen-workspace")
    if source_path.suffix.lower() not in {".md", ".markdown", ".txt"}:
        raise ValueError("input must be Markdown or plain text")
    if output_path.suffix.lower() != ".pdf":
        raise ValueError("output must end in .pdf")
    if source_path.stat().st_size <= 0 or source_path.stat().st_size > MAX_INPUT_BYTES:
        raise ValueError("input size is invalid")
    if source_path == output_path:
        raise ValueError("input and output must differ")
    return source_path, output_path


def inline_markup(value: str) -> str:
    escaped = html.escape(value.strip())
    escaped = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", escaped)
    escaped = re.sub(r"`([^`]+)`", r"<font name='Courier'>\1</font>", escaped)
    return escaped


def render(source_path: Path, output_path: Path) -> None:
    text = source_path.read_text(encoding="utf-8")
    pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
    font = "STSong-Light"
    styles = getSampleStyleSheet()
    body = ParagraphStyle(
        "ArtigenBody",
        parent=styles["BodyText"],
        fontName=font,
        fontSize=10.5,
        leading=16,
        spaceAfter=3 * mm,
        wordWrap="CJK",
    )
    title = ParagraphStyle(
        "ArtigenTitle",
        parent=body,
        fontSize=21,
        leading=27,
        alignment=TA_CENTER,
        spaceAfter=8 * mm,
    )
    heading = ParagraphStyle(
        "ArtigenHeading",
        parent=body,
        fontSize=15,
        leading=21,
        spaceBefore=4 * mm,
        spaceAfter=3 * mm,
    )
    subheading = ParagraphStyle(
        "ArtigenSubheading",
        parent=body,
        fontSize=12.5,
        leading=18,
        spaceBefore=3 * mm,
    )
    story = []
    paragraph: list[str] = []
    bullets: list[str] = []

    def flush_paragraph() -> None:
        if paragraph:
            story.append(Paragraph(inline_markup(" ".join(paragraph)), body))
            paragraph.clear()

    def flush_bullets() -> None:
        if bullets:
            story.append(ListFlowable(
                [ListItem(Paragraph(inline_markup(item), body)) for item in bullets],
                bulletType="bullet",
                leftIndent=8 * mm,
            ))
            story.append(Spacer(1, 2 * mm))
            bullets.clear()

    for raw_line in text.splitlines():
        line = raw_line.rstrip()
        heading_match = re.match(r"^(#{1,3})\s+(.+)$", line)
        bullet_match = re.match(r"^\s*[-*+]\s+(.+)$", line)
        if heading_match:
            flush_paragraph()
            flush_bullets()
            level = len(heading_match.group(1))
            story.append(Paragraph(
                inline_markup(heading_match.group(2)),
                title if level == 1 else heading if level == 2 else subheading,
            ))
        elif bullet_match:
            flush_paragraph()
            bullets.append(bullet_match.group(1))
        elif not line.strip():
            flush_paragraph()
            flush_bullets()
        else:
            flush_bullets()
            paragraph.append(line.strip())
    flush_paragraph()
    flush_bullets()
    if not story:
        raise ValueError("input has no renderable content")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = output_path.with_name(f".{output_path.name}.{os.getpid()}.tmp")
    document = SimpleDocTemplate(
        str(temporary),
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title=source_path.stem,
        author="Artigen Agent",
    )
    document.build(story)
    if temporary.stat().st_size <= 0:
        raise ValueError("generated PDF is empty")
    temporary.replace(output_path)


def main() -> int:
    if len(sys.argv) != 3:
        usage()
        return 2
    try:
        source_path, output_path = safe_paths(sys.argv[1], sys.argv[2])
        render(source_path, output_path)
        print(str(output_path))
        return 0
    except Exception as exc:  # Keep task output concise and secret-free.
        print(f"artigen-report-pdf: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
