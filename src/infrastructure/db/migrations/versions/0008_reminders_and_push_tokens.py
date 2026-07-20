"""add reminders and push_tokens tables

Revision ID: 0008
Revises: 0007
Create Date: 2026-07-19
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "reminders",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "companion_id", UUID(as_uuid=True), sa.ForeignKey("companions.id"), nullable=False
        ),
        sa.Column("message", sa.Text, nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_reminders_companion_id", "reminders", ["companion_id"])
    op.create_index("ix_reminders_due_at", "reminders", ["due_at"])

    # Own table rather than a column on `users` — see PushToken entity notes
    # (src/domain/push/entity.py). user_id is the primary key: one token per
    # user for now (single-device), upserted in place on re-registration.
    op.create_table(
        "push_tokens",
        sa.Column(
            "user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), primary_key=True
        ),
        sa.Column("token", sa.Text, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )


def downgrade() -> None:
    op.drop_table("push_tokens")
    op.drop_index("ix_reminders_due_at", table_name="reminders")
    op.drop_index("ix_reminders_companion_id", table_name="reminders")
    op.drop_table("reminders")
