"""email_suppressions table for bounce/complaint webhook

Revision ID: 0007
Revises: 0006
Create Date: 2026-07-20
"""
import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Addresses Resend reported as hard-bounced or complained (spam), fed in by
    # the /webhooks/resend endpoint. SendVerificationCode checks this before every
    # email send so we stop mailing dead/hostile addresses — continuing to would
    # sink the sending domain's reputation and risk the account being blocked.
    op.create_table(
        "email_suppressions",
        sa.Column("email", sa.String(length=255), primary_key=True),
        sa.Column("reason", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("email_suppressions")
