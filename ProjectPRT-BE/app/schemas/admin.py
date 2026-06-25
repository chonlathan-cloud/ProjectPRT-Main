from pydantic import BaseModel, Field
from typing import List, Optional


class RolesUpdateRequest(BaseModel):
    roles: List[str]


class UserUpdateRequest(BaseModel):
    name: Optional[str] = None
    position: Optional[str] = None


class PasswordResetRequest(BaseModel):
    password: str = Field(..., min_length=6)
