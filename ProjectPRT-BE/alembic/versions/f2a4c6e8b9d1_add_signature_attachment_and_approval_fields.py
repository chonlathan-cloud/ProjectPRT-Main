"""add signature attachment type and approval fields

Revision ID: f2a4c6e8b9d1
Revises: b1e3c5d7f8a9
Create Date: 2026-04-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f2a4c6e8b9d1"
down_revision: Union[str, Sequence[str], None] = "b1e3c5d7f8a9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE attachment_type ADD VALUE IF NOT EXISTS 'SIGNATURE'")

    op.add_column("cases", sa.Column("approved_by", sa.String(), nullable=True))
    op.add_column("cases", sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("cases", "approved_at")
    op.drop_column("cases", "approved_by")
    # PostgreSQL does not support removing enum values safely.
    pass
