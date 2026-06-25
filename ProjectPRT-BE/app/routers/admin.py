from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.hashing import Hasher
from app.db import get_db
from app.models import User, UserRole
from app.rbac import ASSIGNABLE_ROLES, ROLE_ADMIN, SYSTEM_MANAGED_ROLES, require_roles
from app.schemas.common import make_success_response, make_error_response
from app.schemas.admin import PasswordResetRequest, RolesUpdateRequest, UserUpdateRequest

router = APIRouter(
    prefix="/api/v1",
    tags=["Admin"],
)


def _serialize_user(db: Session, user: User) -> dict:
    roles = [ur.role for ur in db.query(UserRole).filter(UserRole.user_id == user.id).all()]
    return {
        "user_id": str(user.id),
        "google_sub": user.google_sub,
        "email": user.email,
        "name": user.name,
        "position": user.position,
        "roles": roles,
        "is_active": user.is_active,
        "is_approved": getattr(user, "is_approved", True),
    }


@router.get("/admin/users")
async def list_users(
    request: Request,
    include_inactive: bool = Query(False),
    db: Session = Depends(get_db),
):
    _, auth_error = require_roles(db, request, [ROLE_ADMIN])
    if auth_error:
        return auth_error

    query = db.query(User)
    if not include_inactive:
        query = query.filter(User.is_active.is_(True))
    users = query.order_by(User.created_at.desc()).all()

    return make_success_response([_serialize_user(db, user) for user in users])


@router.post("/admin/users/{user_id}/roles")
async def update_user_roles(user_id: str, payload: RolesUpdateRequest, request: Request, db: Session = Depends(get_db)):
    _, auth_error = require_roles(db, request, [ROLE_ADMIN])
    if auth_error:
        return auth_error

    requested_roles = list(dict.fromkeys(payload.roles))
    restricted_roles = [r for r in requested_roles if r in SYSTEM_MANAGED_ROLES]
    if restricted_roles:
        return JSONResponse(
            status_code=403,
            content=make_error_response(
                code="FORBIDDEN",
                message="Approver authority is system-managed. Contact the system creator to change approvers.",
                details={"restricted_roles": restricted_roles},
            ),
        )

    invalid_roles = [r for r in requested_roles if r not in ASSIGNABLE_ROLES]
    if invalid_roles:
        return JSONResponse(
            status_code=400,
            content=make_error_response(
                code="VALIDATION_ERROR",
                message="Invalid roles",
                details={"invalid_roles": invalid_roles},
            ),
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return JSONResponse(
            status_code=404,
            content=make_error_response(
                code="NOT_FOUND",
                message="User not found",
                details={},
            ),
        )

    db.query(UserRole).filter(
        UserRole.user_id == user.id,
        ~UserRole.role.in_(tuple(SYSTEM_MANAGED_ROLES)),
    ).delete(synchronize_session=False)
    db.flush()
    for role in requested_roles:
        db.add(UserRole(user_id=user.id, role=role))
    db.commit()

    return make_success_response(_serialize_user(db, user))


@router.patch("/admin/users/{user_id}")
async def update_user(user_id: str, payload: UserUpdateRequest, request: Request, db: Session = Depends(get_db)):
    _, auth_error = require_roles(db, request, [ROLE_ADMIN])
    if auth_error:
        return auth_error

    user = db.query(User).filter(User.id == user_id, User.is_active.is_(True)).first()
    if not user:
        return JSONResponse(
            status_code=404,
            content=make_error_response(
                code="NOT_FOUND",
                message="User not found",
                details={},
            ),
        )

    update_data = payload.model_dump(exclude_unset=True)
    if "name" in update_data:
        user.name = update_data["name"]
    if "position" in update_data:
        user.position = update_data["position"]

    db.commit()
    db.refresh(user)

    return make_success_response(_serialize_user(db, user))


@router.delete("/admin/users/{user_id}")
async def delete_user(user_id: str, request: Request, db: Session = Depends(get_db)):
    _, auth_error = require_roles(db, request, [ROLE_ADMIN])
    if auth_error:
        return auth_error

    user = db.query(User).filter(User.id == user_id, User.is_active.is_(True)).first()
    if not user:
        return JSONResponse(
            status_code=404,
            content=make_error_response(
                code="NOT_FOUND",
                message="User not found",
                details={},
            ),
        )

    user.is_active = False
    db.commit()
    db.refresh(user)

    return make_success_response(
        {
            "user_id": str(user.id),
            "is_active": user.is_active,
        }
    )


@router.post("/admin/users/{user_id}/restore")
async def restore_user(user_id: str, request: Request, db: Session = Depends(get_db)):
    _, auth_error = require_roles(db, request, [ROLE_ADMIN])
    if auth_error:
        return auth_error

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return JSONResponse(
            status_code=404,
            content=make_error_response(
                code="NOT_FOUND",
                message="User not found",
                details={},
            ),
        )

    user.is_active = True
    db.commit()
    db.refresh(user)

    return make_success_response(_serialize_user(db, user))


@router.post("/admin/users/{user_id}/approve")
async def approve_user(user_id: str, request: Request, db: Session = Depends(get_db)):
    _, auth_error = require_roles(db, request, [ROLE_ADMIN])
    if auth_error:
        return auth_error

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return JSONResponse(
            status_code=404,
            content=make_error_response(
                code="NOT_FOUND",
                message="User not found",
                details={},
            ),
        )

    user.is_approved = True
    user.is_active = True
    db.commit()
    db.refresh(user)

    return make_success_response(_serialize_user(db, user))


@router.post("/admin/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: str,
    payload: PasswordResetRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    _, auth_error = require_roles(db, request, [ROLE_ADMIN])
    if auth_error:
        return auth_error

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return JSONResponse(
            status_code=404,
            content=make_error_response(
                code="NOT_FOUND",
                message="User not found",
                details={},
            ),
        )

    user.hashed_password = Hasher.get_password_hash(payload.password)
    db.commit()
    db.refresh(user)

    return make_success_response(_serialize_user(db, user))


@router.get("/me")
async def get_me(request: Request, db: Session = Depends(get_db)):
    user, auth_error = require_roles(db, request, [])  # just auth
    if auth_error:
        return auth_error
    roles = [ur.role for ur in db.query(UserRole).filter(UserRole.user_id == user.id).all()]
    return make_success_response(
        {
            "user_id": str(user.id),
            "google_sub": user.google_sub,
            "email": user.email,
            "name": user.name,
            "roles": roles,
            "is_approved": getattr(user, "is_approved", True),
        }
    )
