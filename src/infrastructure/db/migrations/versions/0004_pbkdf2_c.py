"""add pbkdf2_c to user_keys

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-24
"""
import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Default 100_000 for rows created before this migration (original iteration count).
    # New registrations send pbkdf2_c explicitly so the server stores the actual value used.
    op.add_column(
        "user_keys",
        sa.Column("pbkdf2_c", sa.Integer(), nullable=False, server_default="100000"),
    )
    op.alter_column("user_keys", "pbkdf2_c", server_default=None)


def downgrade() -> None:
    op.drop_column("user_keys", "pbkdf2_c")
