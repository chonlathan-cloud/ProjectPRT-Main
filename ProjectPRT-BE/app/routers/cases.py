import base64
import binascii
from datetime import datetime, timezone
from typing import Optional, List, Annotated
from uuid import UUID
import uuid

from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import select, desc, func

from app.services.doc_numbers import generate_document_no

from app.db import get_db
from app.deps import Role, has_role, get_current_user, UserInDB
from app.models import (
    Category,
    Case,
    CaseStatus,
    Document,
    DocumentType,
    CategoryType,
    User,
    Attachment,
    AttachmentType,
)
from app.schemas.workflow import WorkflowResponse
from app.schemas.case import CaseCreate, CaseResponse
from app.schemas.files import FileUploadResponse
from app.services.audit import log_audit_event
from app.services import gcs, pdf as pdf_service
from pydantic import BaseModel, Field

router = APIRouter(
    prefix="/api/v1/cases",
    tags=["Cases"]
)

# ✅ Model พิเศษสำหรับหน้า Admin/Dashboard
class CaseAdminView(BaseModel):
    id: UUID
    case_no: str
    doc_no: Optional[str] = None
    requester_name: str
    description: str
    requested_amount: float
    created_at: datetime
    status: str
    department: Optional[str] = None
    is_receipt_uploaded: bool
    ps_url: Optional[str] = None
    mime_type: Optional[str] = None

    class Config:
        from_attributes = True

class CaseRejectRequest(BaseModel):
    note: str


class PaginatedCaseAdminResponse(BaseModel):
    items: List[CaseAdminView]
    total: int
    page: int
    limit: int
    total_pages: int


class SignaturePlacementRequest(BaseModel):
    x: float = Field(..., ge=0.0, le=1.0)
    y: float = Field(..., ge=0.0, le=1.0)
    width: float = Field(..., gt=0.05, le=0.5)


class CaseApproveRequest(BaseModel):
    signature_base64: str
    signature_position: Optional[SignaturePlacementRequest] = None

# --- Helper Functions ---
def generate_case_no() -> str:
    today_str = datetime.now(timezone.utc).strftime("%y%m%d")
    unique_suffix = uuid.uuid4().hex[:6].upper()
    return f"CAS-{today_str}-{unique_suffix}"

def _ensure_case_visibility(db_case: Case, current_user: UserInDB) -> None:
    can_see_all = any(role in current_user.roles for role in [
        Role.FINANCE, Role.ACCOUNTING, Role.ADMIN, Role.EXECUTIVE, Role.TREASURY
    ])
    if not can_see_all and db_case.requester_id != current_user.username:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to view this case.")


def _get_case_folder_name(db: Session, db_case: Case) -> str:
    doc = db.execute(select(Document).filter_by(case_id=db_case.id)).scalar_one_or_none()
    if doc and doc.doc_no:
        return doc.doc_no
    return db_case.case_no


def _can_see_all_cases(current_user: UserInDB) -> bool:
    return any(role in current_user.roles for role in [
        Role.FINANCE, Role.ACCOUNTING, Role.ADMIN, Role.EXECUTIVE, Role.TREASURY
    ])


def _map_case_admin_results(db: Session, results: list) -> list[CaseAdminView]:
    case_ids = [row.id for row in results]
    ps_map: dict[UUID, tuple[str, Optional[str]]] = {}
    if case_ids:
        ps_rows = db.query(Attachment.case_id, Attachment.gcs_uri, Attachment.uploaded_at)\
            .filter(
                Attachment.type == AttachmentType.PS,
                Attachment.case_id.in_(case_ids)
            )\
            .order_by(Attachment.case_id, desc(Attachment.uploaded_at))\
            .all()
        for case_id, gcs_uri, _uploaded_at in ps_rows:
            if case_id not in ps_map:
                ps_map[case_id] = (gcs_uri, gcs.get_blob_content_type(gcs_uri))

    mapped_results = []
    for row in results:
        ps_attachment = ps_map.get(row.id)
        ps_gcs_uri = ps_attachment[0] if ps_attachment else None
        ps_mime_type = ps_attachment[1] if ps_attachment else None
        mapped_results.append(CaseAdminView(
            id=row.id,
            case_no=row.case_no,
            doc_no=row.doc_no if row.doc_no else "-",
            requester_name=row.requester_name if row.requester_name else "Unknown",
            description=row.description,
            requested_amount=float(row.requested_amount),
            created_at=row.created_at,
            status=row.status.value,
            department=row.department,
            is_receipt_uploaded=bool(row.is_receipt_uploaded),
            ps_url=gcs.generate_signed_download_url(ps_gcs_uri) if ps_gcs_uri else None,
            mime_type=ps_mime_type
        ))

    return mapped_results


def _decode_signature_payload(signature_base64: str) -> tuple[bytes, str, str]:
    if not signature_base64 or "," not in signature_base64:
        raise HTTPException(status_code=400, detail="signature_base64 must be a valid data URL")

    header, encoded_data = signature_base64.split(",", 1)
    if not header.startswith("data:") or ";base64" not in header:
        raise HTTPException(status_code=400, detail="signature_base64 must include a supported base64 header")

    mime_type = header[5:].split(";")[0].strip().lower()
    extension_map = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/webp": "webp",
        "image/gif": "gif",
    }
    file_extension = extension_map.get(mime_type)
    if not file_extension:
        raise HTTPException(status_code=400, detail="Unsupported signature mime type")

    try:
        file_bytes = base64.b64decode(encoded_data, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise HTTPException(status_code=400, detail="Invalid signature_base64 payload") from exc

    return file_bytes, mime_type, file_extension

# --- Endpoints ---

@router.post("/", response_model=CaseResponse, status_code=status.HTTP_201_CREATED)
async def create_case(
    payload: CaseCreate,
    current_user: Annotated[UserInDB, Depends(get_current_user)],
    db: Session = Depends(get_db)
):
    category = db.execute(select(Category).filter_by(id=payload.category_id)).scalar_one_or_none()
    if not category:
        raise HTTPException(404, "Category not found.")
    if not category.is_active:
        raise HTTPException(400, "Category is inactive.")

    if category.type in [CategoryType.REVENUE, CategoryType.ASSET]:
        if not payload.deposit_account_id:
            raise HTTPException(400, "Deposit account is required for Revenue/Asset cases.")

    case_no = generate_case_no()
    db_case = Case(
        case_no=case_no,
        category_id=payload.category_id,
        account_code=category.account_code,
        requester_id=current_user.username,
        department_id=payload.department_id,
        cost_center_id=payload.cost_center_id,
        funding_type=payload.funding_type,
        requested_amount=payload.requested_amount,
        purpose=payload.purpose,
        status=CaseStatus.DRAFT,
        deposit_account_id=payload.deposit_account_id,
        is_receipt_uploaded=False,
        created_by=current_user.username
    )
    db.add(db_case)
    db.commit()
    db.refresh(db_case)
    log_audit_event(db, "case", db_case.id, "create", current_user.username, payload.model_dump(mode="json"))
    return CaseResponse.model_validate(db_case)

@router.post("/{case_id}/upload-receipt", response_model=FileUploadResponse)
async def upload_receipt(
    case_id: UUID,
    current_user: Annotated[UserInDB, Depends(get_current_user)],
    file: UploadFile = File(...),
    attachment_type: AttachmentType = Form(AttachmentType.RECEIPT),
    db: Session = Depends(get_db)
):
    db_case = db.execute(select(Case).filter_by(id=case_id)).scalar_one_or_none()
    if not db_case:
        raise HTTPException(status_code=404, detail="Case not found")

    doc = db.execute(select(Document).filter_by(case_id=case_id)).scalar_one_or_none()
    folder_name = doc.doc_no if doc else db_case.case_no

    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    destination_blob_name = f"{folder_name}/{timestamp}_{file.filename}"
    file_content = await file.read()
    gcs_uri = gcs.upload_bytes(
        destination_blob_name,
        file_content,
        content_type=file.content_type or "application/octet-stream",
    )

    attachment = Attachment(
        case_id=case_id,
        type=attachment_type,
        gcs_uri=destination_blob_name,
        uploaded_by=current_user.username
    )
    db.add(attachment)
    if attachment_type == AttachmentType.RECEIPT:
        db_case.is_receipt_uploaded = True
    db.commit()
    db.refresh(attachment)

    return FileUploadResponse(
        id=attachment.id,
        case_id=case_id,
        file_name=file.filename,
        url=gcs_uri,
        type=attachment.type
    )

@router.post("/{case_id}/submit", response_model=WorkflowResponse)
async def submit_case(
    case_id: UUID,
    current_user: Annotated[UserInDB, Depends(get_current_user)],
    db: Session = Depends(get_db)
):
    db_case = db.execute(select(Case).filter_by(id=case_id)).scalar_one_or_none()
    if not db_case:
        raise HTTPException(404, "Case not found.")

    if db_case.requester_id != current_user.username:
        raise HTTPException(403, "Not authorized.")
    if db_case.status != CaseStatus.DRAFT:
        raise HTTPException(409, "Only DRAFT cases can be submitted.")

    # --- Gen Document No ---
    category = db.execute(select(Category).filter_by(id=db_case.category_id)).scalar_one()

    if category.type == CategoryType.EXPENSE:
        doc_type = DocumentType.PV
    elif category.type == CategoryType.REVENUE:
        doc_type = DocumentType.RV
    else:
        doc_type = DocumentType.JV  # ครอบคลุม ASSET และอื่นๆ

    existing_doc = db.execute(select(Document).filter_by(case_id=case_id)).scalar_one_or_none()

    if not existing_doc:
        doc_no = generate_document_no(db, doc_type)
        new_doc = Document(
            case_id=case_id,
            doc_type=doc_type,
            doc_no=doc_no,
            amount=db_case.requested_amount,
            pdf_uri="pending-approval",
            created_by=current_user.username
        )
        db.add(new_doc)
        db.flush()
    else:
        doc_no = existing_doc.doc_no

    old_status = db_case.status
    db_case.status = CaseStatus.SUBMITTED
    db_case.updated_by = current_user.username
    db_case.updated_at = datetime.now(timezone.utc)

    log_audit_event(
        db, "case", db_case.id, "submit_and_gen_no", current_user.username,
        {"old": old_status.value, "new": db_case.status.value, "doc_no": doc_no}
    )

    db.commit()
    db.refresh(db_case)

    return WorkflowResponse(
        message=f"Submitted. Generated {doc_no}",
        case_id=str(db_case.id),
        status=db_case.status.value,
        doc_no=doc_no
    )

@router.post("/{case_id}/approve", response_model=WorkflowResponse)
async def approve_case(
    case_id: UUID,
    payload: CaseApproveRequest,
    current_user: Annotated[UserInDB, Depends(has_role([Role.FINANCE, Role.ADMIN, Role.ACCOUNTING]))],
    db: Session = Depends(get_db)
):
    db_case = db.execute(select(Case).filter_by(id=case_id)).scalar_one_or_none()
    if not db_case:
        raise HTTPException(404, "Case not found")

    if db_case.status != CaseStatus.SUBMITTED:
        raise HTTPException(409, "Case must be SUBMITTED to approve.")

    category = db.execute(select(Category).filter_by(id=db_case.category_id)).scalar_one()
    new_status = CaseStatus.APPROVED if category.type == CategoryType.EXPENSE else CaseStatus.CLOSED

    doc = db.execute(select(Document).filter_by(case_id=case_id)).scalar_one_or_none()
    if not doc:
        raise HTTPException(409, "Case has no generated document to approve.")

    doc_no = doc.doc_no
    folder_name = _get_case_folder_name(db, db_case)

    signature_bytes, signature_mime_type, signature_extension = _decode_signature_payload(payload.signature_base64)
    signature_timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    signature_blob_name = f"{folder_name}/{signature_timestamp}_approval-signature.{signature_extension}"
    gcs.upload_bytes(
        signature_blob_name,
        signature_bytes,
        content_type=signature_mime_type,
    )
    signature_attachment = Attachment(
        case_id=case_id,
        type=AttachmentType.SIGNATURE,
        gcs_uri=signature_blob_name,
        uploaded_by=current_user.username,
    )
    db.add(signature_attachment)
    db.flush()

    approval_timestamp = datetime.now(timezone.utc)
    ps_attachment = db.query(Attachment)\
        .filter(
            Attachment.case_id == case_id,
            Attachment.type == AttachmentType.PS,
        )\
        .order_by(desc(Attachment.uploaded_at))\
        .first()
    if not ps_attachment:
        raise HTTPException(409, "Case has no PS document to stamp for approval.")

    ps_mime_type = gcs.get_blob_content_type(ps_attachment.gcs_uri)
    if ps_mime_type and ps_mime_type.lower() != "application/pdf":
        raise HTTPException(409, "PS attachment must be a PDF for approval stamping.")

    original_ps_pdf_bytes = gcs.download_bytes(ps_attachment.gcs_uri)
    approved_pdf_bytes = pdf_service.stamp_signature_on_pdf(
        original_pdf_bytes=original_ps_pdf_bytes,
        signature_bytes=signature_bytes,
        approved_at=approval_timestamp,
        signature_position=payload.signature_position.model_dump() if payload.signature_position else None,
    )
    approved_pdf_blob_name = f"{folder_name}/{signature_timestamp}_{doc_no}_approved.pdf"
    approved_pdf_uri = gcs.upload_bytes(
        approved_pdf_blob_name,
        approved_pdf_bytes,
        content_type="application/pdf",
    )

    old_status = db_case.status
    db_case.status = new_status
    db_case.approved_by = current_user.username
    db_case.approved_at = approval_timestamp
    db_case.updated_by = current_user.username
    db_case.updated_at = db_case.approved_at
    doc.pdf_uri = approved_pdf_uri
    doc.updated_by = current_user.username
    doc.updated_at = approval_timestamp

    log_audit_event(
        db, "case", case_id, "approve", current_user.username,
        {
            "old_status": old_status.value,
            "new_status": new_status.value,
            "doc_no": doc_no,
            "approved_by": db_case.approved_by,
            "approved_at": db_case.approved_at.isoformat() if db_case.approved_at else None,
            "signature_attachment_id": str(signature_attachment.id),
            "signature_gcs_uri": signature_blob_name,
            "approved_pdf_uri": approved_pdf_uri,
            "signature_position": payload.signature_position.model_dump() if payload.signature_position else None,
        }
    )
    db.commit()

    return WorkflowResponse(
        message=f"Case Approved ({doc_no})",
        case_id=str(case_id),
        status=new_status.value,
        doc_no=doc_no,
        audit_details={
            "approved_by": db_case.approved_by,
            "approved_at": db_case.approved_at.isoformat() if db_case.approved_at else None,
            "signature_attachment_id": str(signature_attachment.id),
            "signature_url": gcs.generate_signed_download_url(signature_blob_name),
            "approved_pdf_url": gcs.generate_signed_download_url(approved_pdf_blob_name),
        }
    )

@router.post("/{case_id}/reject", response_model=WorkflowResponse)
async def reject_case(
    case_id: UUID,
    payload: CaseRejectRequest,
    current_user: Annotated[UserInDB, Depends(has_role([Role.FINANCE, Role.ADMIN, Role.ACCOUNTING]))],
    db: Session = Depends(get_db)
):
    db_case = db.execute(select(Case).filter_by(id=case_id)).scalar_one_or_none()
    if not db_case:
        raise HTTPException(404, "Case not found")

    if db_case.status != CaseStatus.SUBMITTED:
        raise HTTPException(409, "Case must be SUBMITTED to reject.")

    note = payload.note.strip()
    if not note:
        raise HTTPException(400, "Reject reason is required.")

    doc = db.execute(select(Document).filter_by(case_id=case_id)).scalar_one_or_none()
    doc_no = doc.doc_no if doc else "N/A"

    old_status = db_case.status
    db_case.status = CaseStatus.REJECTED
    db_case.reject_reason = note
    db_case.rejected_at = datetime.now(timezone.utc)
    db_case.updated_by = current_user.username
    db_case.updated_at = datetime.now(timezone.utc)

    db.commit()
    log_audit_event(
        db, "case", case_id, "reject", current_user.username,
        {"old_status": old_status.value, "new_status": db_case.status.value, "doc_no": doc_no, "note": note}
    )

    return WorkflowResponse(
        message=f"Case Rejected ({doc_no})",
        case_id=str(case_id),
        status=db_case.status.value,
        doc_no=doc_no
    )

@router.post("/{case_id}/pay", response_model=WorkflowResponse)
async def mark_paid(
    case_id: UUID,
    current_user: Annotated[UserInDB, Depends(has_role([Role.TREASURY, Role.ADMIN]))],
    db: Session = Depends(get_db)
):
    db_case = db.execute(select(Case).filter_by(id=case_id)).scalar_one_or_none()
    if not db_case:
        raise HTTPException(404, "Case not found")
    if db_case.status != CaseStatus.APPROVED:
        raise HTTPException(409, "Case must be APPROVED to pay.")

    db_case.status = CaseStatus.PAID
    db_case.updated_by = current_user.username
    db_case.updated_at = datetime.now(timezone.utc)
    db.commit()
    return WorkflowResponse(message="Case marked as PAID.", case_id=str(case_id), status="PAID")

@router.get("/", response_model=List[CaseAdminView])
async def read_cases(
    current_user: Annotated[UserInDB, Depends(get_current_user)],
    db: Session = Depends(get_db),
    status: Optional[CaseStatus] = None
):
    query = (
        select(
            Case.id,
            Case.case_no,
            Case.purpose.label("description"),
            Case.requested_amount,
            Case.created_at,
            Case.status,
            Case.is_receipt_uploaded,
            Case.department_id.label("department"),
            Document.doc_no,
            User.name.label("requester_name")
        )
        .outerjoin(Document, Case.id == Document.case_id)
        .outerjoin(User, Case.requester_id == User.email)
    )

    can_see_all = _can_see_all_cases(current_user)
    if not can_see_all:
        query = query.where(Case.requester_id == current_user.username)

    if status:
        query = query.where(Case.status == status)

    query = query.order_by(Case.created_at.desc())

    results = db.execute(query).all()

    return _map_case_admin_results(db, results)


@router.get("/paged", response_model=PaginatedCaseAdminResponse)
async def read_cases_paged(
    current_user: Annotated[UserInDB, Depends(get_current_user)],
    db: Session = Depends(get_db),
    status: Optional[CaseStatus] = None,
    missing_only: bool = False,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100)
):
    conditions = []
    if not _can_see_all_cases(current_user):
        conditions.append(Case.requester_id == current_user.username)
    if status:
        conditions.append(Case.status == status)
    if missing_only:
        conditions.append(Case.is_receipt_uploaded.is_(False))

    count_query = select(func.count()).select_from(Case)
    if conditions:
        count_query = count_query.where(*conditions)
    total = db.execute(count_query).scalar_one()

    query = (
        select(
            Case.id,
            Case.case_no,
            Case.purpose.label("description"),
            Case.requested_amount,
            Case.created_at,
            Case.status,
            Case.is_receipt_uploaded,
            Case.department_id.label("department"),
            Document.doc_no,
            User.name.label("requester_name")
        )
        .outerjoin(Document, Case.id == Document.case_id)
        .outerjoin(User, Case.requester_id == User.email)
    )

    if conditions:
        query = query.where(*conditions)

    query = query.order_by(Case.created_at.desc()).offset((page - 1) * limit).limit(limit)
    results = db.execute(query).all()
    items = _map_case_admin_results(db, results)
    total_pages = (total + limit - 1) // limit if total else 0

    return PaginatedCaseAdminResponse(
        items=items,
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages
    )

@router.get("/search-by-doc", response_model=List[CaseAdminView])
async def search_cases(
    doc_no: str = Query(..., min_length=3),
    db: Session = Depends(get_db)
):
    """
    ค้นหา Case จากเลขที่เอกสาร (PV-xxxx, RV-xxxx)
    """
    results = db.query(Case).join(Document).filter(
        Document.doc_no.ilike(f"%{doc_no}%")
    ).all()

    mapped_results = []
    for row in results:
        doc = db.query(Document).filter(Document.case_id == row.id).first()
        ps_attachment = db.query(Attachment)\
            .filter(
                Attachment.type == AttachmentType.PS,
                Attachment.case_id == row.id
            )\
            .order_by(desc(Attachment.uploaded_at))\
            .first()
        ps_url = gcs.generate_signed_download_url(ps_attachment.gcs_uri) if ps_attachment else None
        ps_mime_type = gcs.get_blob_content_type(ps_attachment.gcs_uri) if ps_attachment else None
        mapped_results.append(CaseAdminView(
            id=row.id,
            case_no=row.case_no,
            doc_no=doc.doc_no if doc else "-",
            requester_name=row.requester_id,
            description=row.purpose,
            requested_amount=float(row.requested_amount),
            created_at=row.created_at,
            status=row.status.value,
            department=row.department_id,
            is_receipt_uploaded=bool(row.is_receipt_uploaded),
            ps_url=ps_url,
            mime_type=ps_mime_type
        ))
    return mapped_results


@router.get("/search-by-doc-paged", response_model=PaginatedCaseAdminResponse)
async def search_cases_paged(
    current_user: Annotated[UserInDB, Depends(get_current_user)], # ค้นหาจากเลขเอกสาาร 
    db: Session = Depends(get_db),  
    doc_no: str = Query(..., min_length=3),
    missing_only: bool = False, # filter list per page
    page: int = Query(1, ge=1), # Document Number
    limit: int = Query(20, ge=1, le=100) # Number limit per page
):
    conditions = [Document.doc_no.ilike(f"%{doc_no}%")] # Find  Document Number
    if not _can_see_all_cases(current_user):
        conditions.append(Case.requester_id == current_user.username)
    if missing_only:
        conditions.append(Case.is_receipt_uploaded.is_(False))

    count_query = select(func.count()).select_from(Case).join(Document, Case.id == Document.case_id)
    total = db.execute(count_query.where(*conditions)).scalar_one()

    query = (
        select(
            Case.id,
            Case.case_no,
            Case.purpose.label("description"),
            Case.requested_amount,
            Case.created_at,
            Case.status,
            Case.is_receipt_uploaded,
            Case.department_id.label("department"),
            Document.doc_no,
            User.name.label("requester_name")
        )
        .join(Document, Case.id == Document.case_id)
        .outerjoin(User, Case.requester_id == User.email)
        .where(*conditions)
        .order_by(Case.created_at.desc())
        .offset((page - 1) * limit) # skip row how many per page
        .limit(limit) # select row how many per page
    )

    results = db.execute(query).all()
    items = _map_case_admin_results(db, results)
    total_pages = (total + limit - 1) // limit if total else 0

    return PaginatedCaseAdminResponse(
        items=items,
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages
    )

@router.get("/{case_id}", response_model=CaseResponse)
async def read_case(
    case_id: UUID,
    current_user: Annotated[UserInDB, Depends(get_current_user)],
    db: Session = Depends(get_db)
):
    db_case = db.execute(select(Case).filter_by(id=case_id)).scalar_one_or_none()
    if not db_case:
        raise HTTPException(404, "Not Found")
    _ensure_case_visibility(db_case, current_user)
    return CaseResponse.model_validate(db_case)
