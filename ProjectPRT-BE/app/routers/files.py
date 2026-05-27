from datetime import datetime, timezone
from typing import Annotated, Optional
from uuid import UUID
import uuid

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.core.settings import settings
from app.db import get_db
from app.deps import Role, get_current_user, UserInDB
from app.models import Case, Document, Attachment, AttachmentType
from app.services import gcs
from app.schemas.files import FileUploadResponse, SignedUrlResponse

router = APIRouter(
    prefix="/api/v1/files",
    tags=["Files"]
)


def _get_gcs_object_name(gcs_uri: str | None) -> str | None:
    if not gcs_uri or gcs_uri.startswith("pending-"):
        return None

    return gcs_uri.replace(f"gs://{settings.GCS_BUCKET_NAME}/", "")


def _unique_identifiers(values: list[str | None]) -> list[str]:
    identifiers: list[str] = []
    for value in values:
        if value and value not in identifiers:
            identifiers.append(value)
    return identifiers


def _case_owner_identifiers(current_user: UserInDB) -> list[str]:
    return _unique_identifiers([
        current_user.id,
        current_user.email,
        current_user.google_sub,
        current_user.username,
    ])


def _can_see_all_cases(current_user: UserInDB) -> bool:
    return any(role in current_user.roles for role in [
        Role.FINANCE,
        Role.ACCOUNTING,
        Role.ADMIN,
        Role.EXECUTIVE,
        Role.TREASURY,
    ])


def _ensure_case_visibility(db_case: Case, current_user: UserInDB) -> None:
    if not _can_see_all_cases(current_user) and db_case.requester_id not in _case_owner_identifiers(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to access this case.")


def _validate_ps_pdf_upload(file: UploadFile, file_content: bytes) -> None:
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    filename = (file.filename or "").lower()
    allowed_content_types = {"", "application/pdf", "application/octet-stream", "binary/octet-stream"}
    if content_type not in allowed_content_types or not filename.endswith(".pdf") or not file_content.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="PS attachment must be a valid PDF file.")

@router.post("/upload", response_model=FileUploadResponse)
async def upload_file(

    current_user: Annotated[UserInDB, Depends(get_current_user)],
    
    file: UploadFile = File(...),
    case_id: UUID = Form(...),
    attachment_type: AttachmentType = Form(...),
    db: Session = Depends(get_db)
):
    """
    Upload a file to GCS and link it to a Case.
    [NEW] Logic: If attachment_type is RECEIPT, update case.is_receipt_uploaded = True
    """
    # 1. Validate Case
    db_case = db.execute(select(Case).filter_by(id=case_id)).scalar_one_or_none()
    if not db_case:
        raise HTTPException(status_code=404, detail="Case not found")
    _ensure_case_visibility(db_case, current_user)

    # 2. Upload to GCS
    # Generate unique filename: {case_id}/{timestamp}_{original_name}
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    destination_blob_name = f"{case_id}/{timestamp}_{file.filename}"
    
    # Read file content
    file_content = await file.read()
    if attachment_type == AttachmentType.PS:
        _validate_ps_pdf_upload(file, file_content)
    
    # Upload
    public_url = gcs.upload_bytes(
        destination_blob_name, 
        file_content, 
        content_type="application/pdf" if attachment_type == AttachmentType.PS else file.content_type
    )

    # 3. Save Attachment Record
    attachment = Attachment(
        case_id=case_id,
        type=attachment_type,
        gcs_uri=destination_blob_name, # Store path for flexibility
        uploaded_by=current_user.username
    )
    db.add(attachment)

    # 4. [NEW LOGIC] Update Case status if Receipt
    if attachment_type == AttachmentType.RECEIPT:
        db_case.is_receipt_uploaded = True
        # Optional: Log audit or check status (must be PAID to be meaningful, but we allow upload anytime)
    
    db.commit()
    db.refresh(attachment)

    return FileUploadResponse(
        id=attachment.id,
        case_id=case_id,
        file_name=file.filename,
        url=public_url,
        type=attachment_type.value
    )

@router.get("/{case_id}/list", response_model=list[FileUploadResponse])
async def list_files(
    case_id: UUID,
    current_user: Annotated[UserInDB, Depends(get_current_user)],
    db: Session = Depends(get_db)
):
    db_case = db.execute(select(Case).filter_by(id=case_id)).scalar_one_or_none()
    if not db_case:
        raise HTTPException(status_code=404, detail="Case not found")
    _ensure_case_visibility(db_case, current_user)

    attachments = db.execute(select(Attachment).filter_by(case_id=case_id)).scalars().all()

    files: list[FileUploadResponse] = []
    doc = db.execute(select(Document).filter_by(case_id=case_id)).scalar_one_or_none()
    document_object_name = _get_gcs_object_name(doc.pdf_uri if doc else None)
    if doc and document_object_name:
        files.append(FileUploadResponse(
            id=doc.id,
            case_id=case_id,
            file_name=f"{doc.doc_no}_approved.pdf",
            url=gcs.generate_download_url(document_object_name),
            type="APPROVED_PDF",
        ))

    files.extend([
        FileUploadResponse(
            id=a.id,
            case_id=a.case_id,
            file_name=a.gcs_uri.split('/')[-1],
            url=gcs.generate_download_url(a.gcs_uri),
            type=a.type.value
        ) for a in attachments
    ])

    return files
