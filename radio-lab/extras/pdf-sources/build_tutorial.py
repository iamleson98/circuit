#!/usr/bin/env python3
"""build_tutorial.py — assemble the Radio Lab tutorial PDF (Report route).
Body via ReportLab (TocDocTemplate + multiBuild), cover merged via pypdf."""

import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from tut_lib import (S, TocDocTemplate, on_page, MARGIN, DOC_TITLE,
                     Paragraph, Spacer, PageBreak, TableOfContents, A4)
from reportlab.platypus import SimpleDocTemplate
import chapters_a, chapters_b

OUT_DIR = "/home/z/my-project/scripts/radio_pdf"
BODY_PDF = f"{OUT_DIR}/body.pdf"
COVER_PDF = f"{OUT_DIR}/cover.pdf"
FINAL_PDF = "/home/z/my-project/work/radio-lab/docs/radio-lab-tutorial.pdf"


def build_body():
    doc = TocDocTemplate(
        BODY_PDF, pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=MARGIN, bottomMargin=0.85 * MARGIN,
        title=DOC_TITLE, author="Z.ai", creator="Z.ai",
        subject="A beginner AM transmitter + receiver pair designed in tscircuit — theory, "
                "proven design, build guide, and experiments",
    )
    story = []

    story.append(Paragraph("<b>Table of Contents</b>", S["h1"]))
    story.append(Spacer(1, 10))
    toc = TableOfContents()
    toc.levelStyles = [S["toc0"], S["toc1"]]
    story.append(toc)
    story.append(PageBreak())

    chapters_a.ch1(story)
    chapters_a.ch2(story)
    chapters_a.ch3(story)
    chapters_a.ch4(story)
    chapters_a.ch5(story)
    chapters_b.ch6(story)
    chapters_b.ch7(story)
    chapters_b.ch8(story)
    chapters_b.ch9(story)
    chapters_b.ch10(story)
    chapters_b.ch11(story)

    doc.multiBuild(story, onFirstPage=on_page, onLaterPages=on_page)
    print(f"body built: {BODY_PDF}")


def merge():
    from pypdf import PdfReader, PdfWriter
    A4_W, A4_H = 595.28, 841.89

    def normalize(page):
        w, h = float(page.mediabox.width), float(page.mediabox.height)
        if abs(w - A4_W) > 0.5 or abs(h - A4_H) > 0.5:
            page.scale_to(A4_W, A4_H)
        return page

    writer = PdfWriter()
    writer.add_page(normalize(PdfReader(COVER_PDF).pages[0]))
    for p in PdfReader(BODY_PDF).pages:
        writer.add_page(normalize(p))
    writer.add_metadata({
        "/Title": DOC_TITLE,
        "/Author": "Z.ai",
        "/Creator": "Z.ai",
        "/Subject": "A beginner AM transmitter + receiver pair designed in tscircuit — theory, "
                    "proven design, build guide, and experiments",
    })
    os.makedirs(os.path.dirname(FINAL_PDF), exist_ok=True)
    with open(FINAL_PDF, "wb") as f:
        writer.write(f)
    print(f"final: {FINAL_PDF} ({os.path.getsize(FINAL_PDF)//1024} KB)")


if __name__ == "__main__":
    build_body()
    merge()
