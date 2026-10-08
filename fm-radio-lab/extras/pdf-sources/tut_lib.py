#!/usr/bin/env python3
"""tut_lib.py — shared fonts, palette, styles and flowable helpers for the
Radio Lab tutorial PDF (Report route, ReportLab)."""

import os, sys, hashlib
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch, mm
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    Paragraph, Spacer, Table, TableStyle, Image, PageBreak, CondPageBreak,
    KeepTogether, SimpleDocTemplate, HRFlowable, Preformatted,
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily

PDF_SKILL_DIR = "/home/z/my-project/skills/pdf"
sys.path.insert(0, os.path.join(PDF_SKILL_DIR, "scripts"))

# ━━ Fonts (registered set only) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FONT_DIR = "/usr/share/fonts"
pdfmetrics.registerFont(TTFont("NotoSerifSC", f"{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf"))
pdfmetrics.registerFont(TTFont("NotoSerifSC-Bold", f"{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif", f"{FONT_DIR}/truetype/freefont/FreeSerif.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif-Bold", f"{FONT_DIR}/truetype/freefont/FreeSerifBold.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif-Italic", f"{FONT_DIR}/truetype/freefont/FreeSerifItalic.ttf"))
pdfmetrics.registerFont(TTFont("FreeSerif-BoldItalic", f"{FONT_DIR}/truetype/freefont/FreeSerifBoldItalic.ttf"))
pdfmetrics.registerFont(TTFont("DejaVuSans", f"{FONT_DIR}/truetype/dejavu/DejaVuSansMono.ttf"))
registerFontFamily("NotoSerifSC", normal="NotoSerifSC", bold="NotoSerifSC-Bold")
registerFontFamily("FreeSerif", normal="FreeSerif", bold="FreeSerif-Bold",
                   italic="FreeSerif-Italic", boldItalic="FreeSerif-BoldItalic")
registerFontFamily("DejaVuSans", normal="DejaVuSans", bold="DejaVuSans")

from pdf import install_font_fallback  # noqa: E402
install_font_fallback()

# ━━ Cascade Palette (design_engine.py palette-cascade --intent cold --mode minimal --seed 42) ━━
PAGE_BG = colors.HexColor('#eff0f1')
SECTION_BG = colors.HexColor('#f0f1f2')
CARD_BG = colors.HexColor('#e4e7e8')
TABLE_STRIPE = colors.HexColor('#ebedee')
HEADER_FILL = colors.HexColor('#334650')
COVER_BLOCK = colors.HexColor('#5a7886')
BORDER = colors.HexColor('#b8c8cf')
ICON = colors.HexColor('#52798c')
ACCENT = colors.HexColor('#3681a6')
ACCENT_2 = colors.HexColor('#b43a4e')
TEXT_PRIMARY = colors.HexColor('#1a1b1c')
TEXT_MUTED = colors.HexColor('#6f7578')
SEM_SUCCESS = colors.HexColor('#46875c')
SEM_WARNING = colors.HexColor('#a18347')
SEM_ERROR = colors.HexColor('#92453e')
SEM_INFO = colors.HexColor('#466a8e')

TABLE_HEADER_COLOR = HEADER_FILL
TABLE_ROW_EVEN     = colors.white
TABLE_ROW_ODD      = TABLE_STRIPE

# ━━ Geometry ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MARGIN = 0.9 * inch
PAGE_W, PAGE_H = A4
AVAIL_W = PAGE_W - 2 * MARGIN
AVAIL_H = PAGE_H - 2 * MARGIN
H1_ORPHAN = AVAIL_H * 0.25
MAX_KEEP = PAGE_H * 0.4

# ━━ Styles ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
S = {}
S["h1"] = ParagraphStyle("H1", fontName="FreeSerif", fontSize=21, leading=27,
                         textColor=HEADER_FILL, spaceBefore=18, spaceAfter=10)
S["h2"] = ParagraphStyle("H2", fontName="FreeSerif", fontSize=14.5, leading=19,
                         textColor=HEADER_FILL, spaceBefore=14, spaceAfter=7)
S["h3"] = ParagraphStyle("H3", fontName="FreeSerif", fontSize=11.5, leading=15,
                         textColor=TEXT_PRIMARY, spaceBefore=10, spaceAfter=6)
S["body"] = ParagraphStyle("Body", fontName="FreeSerif", fontSize=10.5, leading=16.5,
                           textColor=TEXT_PRIMARY, alignment=TA_JUSTIFY, spaceAfter=8)
S["bullet"] = ParagraphStyle("Bullet", fontName="FreeSerif", fontSize=10.5, leading=16,
                             textColor=TEXT_PRIMARY, alignment=TA_LEFT,
                             leftIndent=16, bulletIndent=4, spaceAfter=4)
S["caption"] = ParagraphStyle("Caption", fontName="FreeSerif-Italic", fontSize=8.5,
                              leading=11.5, textColor=TEXT_MUTED, alignment=TA_CENTER,
                              spaceBefore=3, spaceAfter=6)
S["code"] = ParagraphStyle("Code", fontName="DejaVuSans", fontSize=7.8, leading=10.6,
                           textColor=TEXT_PRIMARY, backColor=SECTION_BG,
                           borderPadding=6, leftIndent=6, rightIndent=6,
                           spaceBefore=6, spaceAfter=6)
S["quote"] = ParagraphStyle("Quote", fontName="FreeSerif-Italic", fontSize=10.5,
                            leading=16, textColor=TEXT_PRIMARY, leftIndent=24,
                            borderColor=BORDER, spaceBefore=6, spaceAfter=8)
S["cellH"] = ParagraphStyle("CellH", fontName="FreeSerif", fontSize=9, leading=12,
                            textColor=colors.white, alignment=TA_CENTER)
S["cell"] = ParagraphStyle("Cell", fontName="FreeSerif", fontSize=9, leading=12,
                           textColor=TEXT_PRIMARY, alignment=TA_LEFT)
S["cellC"] = ParagraphStyle("CellC", fontName="FreeSerif", fontSize=9, leading=12,
                            textColor=TEXT_PRIMARY, alignment=TA_CENTER)
S["statBig"] = ParagraphStyle("StatBig", fontName="FreeSerif", fontSize=19, leading=23,
                              textColor=ACCENT, alignment=TA_CENTER)
S["statLbl"] = ParagraphStyle("StatLbl", fontName="FreeSerif", fontSize=8.5, leading=11,
                              textColor=TEXT_MUTED, alignment=TA_CENTER)
S["toc0"] = ParagraphStyle("TOC0", fontName="FreeSerif", fontSize=11.5, leading=17,
                           leftIndent=6, textColor=TEXT_PRIMARY)
S["toc1"] = ParagraphStyle("TOC1", fontName="FreeSerif", fontSize=9.5, leading=14,
                           leftIndent=26, textColor=TEXT_MUTED)

# ━━ TOC-aware heading factory ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def heading(text, level=0, style=None):
    """H1/H2 with TOC bookmark attributes + clickable anchor."""
    st = style or (S["h1"] if level == 0 else S["h2"])
    key = "h_" + hashlib.md5(text.encode()).hexdigest()[:8]
    p = Paragraph(f'<a name="{key}"/><b>{text}</b>', st)
    p.bookmark_name = key
    p.bookmark_level = level
    p.bookmark_text = text
    p.bookmark_key = key
    return p

def h1(story, text):
    story.append(CondPageBreak(H1_ORPHAN))
    story.append(heading(text, 0))
    story.append(HRFlowable(width="100%", color=ACCENT, thickness=1.4,
                            spaceBefore=0, spaceAfter=10))

def h2(story, text):
    story.append(CondPageBreak(52))
    story.append(heading(text, 1))

def h3(story, text):
    story.append(Paragraph(f"<b>{text}</b>", S["h3"]))

def body(story, text):
    story.append(Paragraph(text, S["body"]))

def bullets(story, items):
    for it in items:
        story.append(Paragraph(f"•  {it}", S["bullet"]))
    story.append(Spacer(1, 4))

def code(story, text, label=None):
    if label:
        story.append(Paragraph(f'<font color="#747b7e" size="8">{label}</font>',
                               ParagraphStyle("cl", parent=S["caption"], alignment=TA_LEFT,
                                              spaceBefore=6, spaceAfter=0)))
    story.append(Preformatted(text, S["code"]))
    story.append(Spacer(1, 4))

def callout(story, big, label, width=170):
    t = Table([[Paragraph(f"<b>{big}</b>", S["statBig"])],
               [Paragraph(label, S["statLbl"])]], colWidths=[width])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CARD_BG),
        ("BOX", (0, 0), (-1, -1), 1, ACCENT),
        ("TOPPADDING", (0, 0), (-1, 0), 9),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 9),
        ("TOPPADDING", (0, 1), (-1, 1), 1),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 1),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(KeepTogether(t))
    story.append(Spacer(1, 8))

def callout_row(story, items):
    """2-3 stat callouts as ONE centered table (single table = centered per QA)."""
    n = len(items)
    col_w = (AVAIL_W * 0.92) / n
    big_row, lbl_row = [], []
    for big, label in items:
        big_row.append(Paragraph(f"<b>{big}</b>", S["statBig"]))
        lbl_row.append(Paragraph(label, S["statLbl"]))
    t = Table([big_row, lbl_row], colWidths=[col_w] * n, hAlign="CENTER")
    style = [
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, 0), 9), ("BOTTOMPADDING", (0, 0), (-1, 0), 1),
        ("TOPPADDING", (0, 1), (-1, 1), 1), ("BOTTOMPADDING", (0, 1), (-1, 1), 9),
        ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("BACKGROUND", (0, 0), (-1, -1), CARD_BG),
    ]
    for i in range(n):
        style.append(("BOX", (i, 0), (i, 1), 1, ACCENT))
    t.setStyle(TableStyle(style))
    story.append(KeepTogether(t))
    story.append(Spacer(1, 10))

from PIL import Image as PILImage

def figure(story, path, caption_text, max_h=300, max_w=None):
    """Block-level image with aspect ratio preserved + caption, kept together."""
    max_w = max_w or AVAIL_W
    pil = PILImage.open(path)
    ow, oh = pil.size
    ratio = min(max_w / ow if ow > max_w else 1.0, max_h / oh if oh > max_h else 1.0)
    img = Image(path, width=ow * ratio, height=oh * ratio)
    cap = Paragraph(caption_text, S["caption"])
    story.append(Spacer(1, 8))
    story.append(KeepTogether([img, cap]))
    story.append(Spacer(1, 6))

def make_table(story, header, rows, ratios, caption_text=None, align_center_cols=None):
    """Standard palette table: Paragraph cells, HEADER_FILL header, striped."""
    widths = [r * AVAIL_W for r in ratios]
    assert abs(sum(ratios) - 1.0) < 0.01, "ratios must sum to 1"
    acc = set(align_center_cols or [])
    data = [[Paragraph(f"<b>{h}</b>", S["cellH"]) for h in header]]
    for r in rows:
        row = []
        for i, c in enumerate(r):
            st = S["cellC"] if i in acc else S["cell"]
            row.append(Paragraph(str(c), st))
        data.append(row)
    t = Table(data, colWidths=widths, hAlign="CENTER", repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), TABLE_HEADER_COLOR),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.4, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 4.5),
    ]
    for i in range(1, len(data)):
        style.append(("BACKGROUND", (0, i), (-1, i),
                      TABLE_ROW_EVEN if i % 2 == 1 else TABLE_ROW_ODD))
    t.setStyle(TableStyle(style))
    story.append(Spacer(1, 10))
    if caption_text:
        cap = Paragraph(caption_text, S["caption"])
        if len(rows) <= 14:
            story.append(KeepTogether([t, cap]))
        else:
            story.append(t)
            story.append(cap)
    else:
        story.append(t)
    story.append(Spacer(1, 10))

# ━━ Doc template with TOC + header/footer ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DOC_TITLE = "FM Radio Lab — Build Your Own FM Station"

class TocDocTemplate(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        if hasattr(flowable, "bookmark_name"):
            level = getattr(flowable, "bookmark_level", 0)
            text = getattr(flowable, "bookmark_text", "")
            key = getattr(flowable, "bookmark_key", "")
            self.notify("TOCEntry", (level, text, self.page, key))

def on_page(canvas, doc):
    canvas.saveState()
    # header
    canvas.setFont("FreeSerif", 7.5)
    canvas.setFillColor(TEXT_MUTED)
    canvas.drawString(MARGIN, PAGE_H - 0.55 * inch, DOC_TITLE)
    canvas.setStrokeColor(ACCENT)
    canvas.setLineWidth(1.2)
    canvas.line(MARGIN, PAGE_H - 0.62 * inch, PAGE_W - MARGIN, PAGE_H - 0.62 * inch)
    # footer
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.6)
    canvas.line(MARGIN, 0.62 * inch, PAGE_W - MARGIN, 0.62 * inch)
    canvas.setFont("FreeSerif", 7.5)
    canvas.drawString(MARGIN, 0.45 * inch, "Radio Lab · designed with tscircuit · proven by simulation")
    canvas.drawRightString(PAGE_W - MARGIN, 0.45 * inch, f"Page {doc.page}")
    canvas.restoreState()
