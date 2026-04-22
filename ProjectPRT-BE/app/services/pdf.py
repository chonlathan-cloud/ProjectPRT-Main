from io import BytesIO
from datetime import datetime
from typing import Any

from PIL import Image

# Lazy-import reportlab so app can start without the optional dependency installed.
try:
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import A4, letter
    from reportlab.lib.utils import ImageReader
    from reportlab.lib import colors
except ImportError:  # pragma: no cover - defensive path for missing optional dependency
    canvas = None
    letter = None
    A4 = None
    ImageReader = None
    colors = None

try:
    from pypdf import PdfReader, PdfWriter
except ImportError:  # pragma: no cover - defensive path for missing optional dependency
    PdfReader = None
    PdfWriter = None


def _ensure_reportlab():
    if canvas is None or letter is None or A4 is None or ImageReader is None or colors is None:
        raise RuntimeError(
            "reportlab is required for PDF generation. Install with `pip install reportlab`."
        )


def _ensure_pdf_stamper():
    if PdfReader is None or PdfWriter is None:
        raise RuntimeError(
            "pypdf is required for stamping signed PDFs. Install with `pip install pypdf`."
        )


def _clamp(value: float, min_value: float, max_value: float) -> float:
    return max(min_value, min(max_value, value))


def _format_datetime(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d %H:%M:%S UTC")


def generate_approved_document_pdf(
    *,
    doc_type: str,
    doc_no: str,
    case_no: str,
    requester_id: str,
    purpose: str,
    amount: float,
    department: str | None,
    approved_by: str,
    approved_at: datetime,
    signature_bytes: bytes,
    signature_position: dict | None = None,
) -> bytes:
    _ensure_reportlab()

    buffer = BytesIO()
    page_width, page_height = A4
    pdf = canvas.Canvas(buffer, pagesize=A4)

    pdf.setTitle(f"{doc_no} Approved Document")
    pdf.setStrokeColor(colors.HexColor("#CBD5E1"))
    pdf.setFillColor(colors.HexColor("#0F172A"))

    margin_x = 50
    current_y = page_height - 60

    pdf.setFont("Helvetica-Bold", 20)
    pdf.drawString(margin_x, current_y, f"{doc_type} Approval Document")

    current_y -= 18
    pdf.setFont("Helvetica", 11)
    pdf.setFillColor(colors.HexColor("#475569"))
    pdf.drawString(margin_x, current_y, "System-generated approved document with embedded approval signature")

    current_y -= 28
    pdf.setStrokeColor(colors.HexColor("#E2E8F0"))
    pdf.line(margin_x, current_y, page_width - margin_x, current_y)

    current_y -= 28
    pdf.setFillColor(colors.HexColor("#0F172A"))
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(margin_x, current_y, "Document Summary")

    current_y -= 22
    pdf.setFont("Helvetica", 11)
    summary_rows = [
        ("Document No", doc_no),
        ("Case No", case_no),
        ("Requester", requester_id),
        ("Department", department or "-"),
        ("Amount", f"{amount:,.2f} THB"),
        ("Approved By", approved_by),
        ("Approved At", _format_datetime(approved_at)),
    ]

    for label, value in summary_rows:
        pdf.setFillColor(colors.HexColor("#475569"))
        pdf.drawString(margin_x, current_y, f"{label}:")
        pdf.setFillColor(colors.HexColor("#0F172A"))
        pdf.drawString(margin_x + 110, current_y, str(value))
        current_y -= 20

    current_y -= 8
    pdf.setFillColor(colors.HexColor("#0F172A"))
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(margin_x, current_y, "Purpose")

    current_y -= 22
    pdf.setFont("Helvetica", 11)
    text_obj = pdf.beginText(margin_x, current_y)
    text_obj.setFillColor(colors.HexColor("#334155"))
    text_obj.setLeading(16)
    for line in (purpose or "-").splitlines() or ["-"]:
        text_obj.textLine(line[:110])
    pdf.drawText(text_obj)

    signature_section_top = max(text_obj.getY() - 30, 180)
    pdf.setStrokeColor(colors.HexColor("#E2E8F0"))
    pdf.roundRect(margin_x, signature_section_top - 10, page_width - (margin_x * 2), 120, 12, stroke=1, fill=0)

    pdf.setFillColor(colors.HexColor("#0F172A"))
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(margin_x + 16, signature_section_top + 88, "Approval Signature")

    pdf.setFont("Helvetica", 10)
    pdf.setFillColor(colors.HexColor("#475569"))
    pdf.drawString(margin_x + 16, signature_section_top + 72, f"Digitally signed by {approved_by}")
    pdf.drawString(margin_x + 16, signature_section_top + 56, f"Timestamp: {_format_datetime(approved_at)}")

    normalized_x = 0.68
    normalized_y = 0.72
    normalized_width = 0.22
    if signature_position:
        normalized_x = max(0.0, min(1.0, float(signature_position.get("x", normalized_x))))
        normalized_y = max(0.0, min(1.0, float(signature_position.get("y", normalized_y))))
        normalized_width = max(0.08, min(0.5, float(signature_position.get("width", normalized_width))))

    content_x = margin_x
    content_y = 40
    content_width = page_width - (margin_x * 2)
    content_height = page_height - 120
    signature_width = max(120, min(content_width * normalized_width, 220))
    signature_height = 64
    signature_x = content_x + ((content_width - signature_width) * normalized_x)
    signature_y = content_y + ((content_height - signature_height) * (1 - normalized_y))
    signature_y = max(52, min(signature_section_top + 42, signature_y))

    signature_image = ImageReader(BytesIO(signature_bytes))
    pdf.drawImage(
        signature_image,
        signature_x,
        signature_y,
        width=signature_width,
        height=signature_height,
        mask="auto",
        preserveAspectRatio=True,
    )

    pdf.setFont("Helvetica", 9)
    pdf.setFillColor(colors.HexColor("#64748B"))
    pdf.drawString(margin_x, 40, "Generated by PRT approval workflow")

    pdf.showPage()
    pdf.save()
    buffer.seek(0)
    return buffer.getvalue()


def stamp_signature_on_pdf(
    *,
    original_pdf_bytes: bytes, # The original PDF by User
    signature_bytes: bytes, # Picture of signature by Owner
    approved_at: datetime, # Timestamp of approval
    signature_position: dict[str, Any] | None = None, # Optional position for signature placement (x, y, width as normalized values between 0 and 1
) -> bytes:
    _ensure_reportlab()
    _ensure_pdf_stamper()

    reader = PdfReader(BytesIO(original_pdf_bytes))
    if not reader.pages:
      raise RuntimeError("Original PS PDF has no pages.")

    writer = PdfWriter()
    first_page = reader.pages[0]
    page_width = float(first_page.mediabox.width)
    page_height = float(first_page.mediabox.height)

    normalized_x = 0.66
    normalized_y = 0.74
    normalized_width = 0.22
    if signature_position:
        normalized_x = _clamp(float(signature_position.get("x", normalized_x)), 0.0, 1.0)
        normalized_y = _clamp(float(signature_position.get("y", normalized_y)), 0.0, 1.0)
        normalized_width = _clamp(float(signature_position.get("width", normalized_width)), 0.08, 0.5)

    with Image.open(BytesIO(signature_bytes)) as signature_image:
        source_width, source_height = signature_image.size

    signature_width = _clamp(page_width * normalized_width, 72.0, page_width * 0.38)
    signature_height = signature_width * (source_height / max(source_width, 1))
    timestamp_text = f"Approved at: {_format_datetime(approved_at)}"
    timestamp_font_size = 8
    timestamp_gap = 6
    page_padding_x = 14
    page_padding_y = 18
    stamp_height = signature_height + timestamp_gap + timestamp_font_size

    signature_x = _clamp(
        normalized_x * page_width,
        page_padding_x,
        max(page_padding_x, page_width - signature_width - page_padding_x),
    )
    stamp_top_offset = _clamp(
        normalized_y * page_height,
        page_padding_y,
        max(page_padding_y, page_height - stamp_height - page_padding_y),
    )
    signature_y = page_height - stamp_top_offset - signature_height

    overlay_buffer = BytesIO()
    overlay_canvas = canvas.Canvas(overlay_buffer, pagesize=(page_width, page_height))
    overlay_canvas.drawImage(
        ImageReader(BytesIO(signature_bytes)),
        signature_x,
        signature_y,
        width=signature_width,
        height=signature_height,
        mask="auto",
        preserveAspectRatio=True,
    )
    overlay_canvas.setFillColor(colors.HexColor("#475569"))
    overlay_canvas.setFont("Helvetica", timestamp_font_size)
    overlay_canvas.drawString(
        signature_x,
        max(page_padding_y, signature_y - timestamp_gap - timestamp_font_size),
        timestamp_text,
    )
    overlay_canvas.save()
    overlay_buffer.seek(0)

    overlay_page = PdfReader(overlay_buffer).pages[0]
    first_page.merge_page(overlay_page)
    writer.add_page(first_page)

    for remaining_page in reader.pages[1:]:
        writer.add_page(remaining_page)

    output_buffer = BytesIO()
    writer.write(output_buffer)
    output_buffer.seek(0)
    return output_buffer.getvalue()


def generate_ps_pdf(case_id: str, case_no: str, doc_no: str, requester_id: str, category_id: str, account_code: str, amount: float, created_at: str) -> bytes:
    _ensure_reportlab()
    buffer = BytesIO()
    p = canvas.Canvas(buffer, pagesize=letter)
    p.drawString(100, 750, f"Document Type: PS")
    p.drawString(100, 730, f"Document No: {doc_no}")
    p.drawString(100, 710, f"Case ID: {case_id}")
    p.drawString(100, 690, f"Case No: {case_no}")
    p.drawString(100, 670, f"Requester ID: {requester_id}")
    p.drawString(100, 650, f"Category ID: {category_id}")
    p.drawString(100, 630, f"Account Code: {account_code}")
    p.drawString(100, 610, f"Amount: {amount}")
    p.drawString(100, 590, f"Created At: {created_at}")
    p.showPage()
    p.save()
    buffer.seek(0)
    return buffer.getvalue()

def generate_cr_pdf(case_id: str, case_no: str, doc_no: str, requester_id: str, category_id: str, account_code: str, amount: float, created_at: str) -> bytes:
    _ensure_reportlab()
    buffer = BytesIO()
    p = canvas.Canvas(buffer, pagesize=letter)
    p.drawString(100, 750, f"Document Type: CR")
    p.drawString(100, 730, f"Document No: {doc_no}")
    p.drawString(100, 710, f"Case ID: {case_id}")
    p.drawString(100, 690, f"Case No: {case_no}")
    p.drawString(100, 670, f"Requester ID: {requester_id}")
    p.drawString(100, 650, f"Category ID: {category_id}")
    p.drawString(100, 630, f"Account Code: {account_code}")
    p.drawString(100, 610, f"Amount: {amount}")
    p.drawString(100, 590, f"Created At: {created_at}")
    p.showPage()
    p.save()
    buffer.seek(0)
    return buffer.getvalue()

def generate_db_pdf(case_id: str, case_no: str, doc_no: str, requester_id: str, category_id: str, account_code: str, amount: float, created_at: str, cr_amount: float = None, variance: float = None) -> bytes:
    _ensure_reportlab()
    buffer = BytesIO()
    p = canvas.Canvas(buffer, pagesize=letter)
    p.drawString(100, 750, f"Document Type: DB")
    p.drawString(100, 730, f"Document No: {doc_no}")
    p.drawString(100, 710, f"Case ID: {case_id}")
    p.drawString(100, 690, f"Case No: {case_no}")
    p.drawString(100, 670, f"Requester ID: {requester_id}")
    p.drawString(100, 650, f"Category ID: {category_id}")
    p.drawString(100, 630, f"Account Code: {account_code}")
    p.drawString(100, 610, f"Amount: {amount}")
    if cr_amount is not None:
        p.drawString(100, 590, f"CR Amount: {cr_amount}")
    if variance is not None:
        p.drawString(100, 570, f"Variance: {variance}")
    p.drawString(100, 550, f"Created At: {created_at}")
    p.showPage()
    p.save()
    buffer.seek(0)
    return buffer.getvalue()
