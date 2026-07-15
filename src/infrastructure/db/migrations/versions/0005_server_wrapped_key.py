"""add server-wrapped key to user_keys for background memory compression

Revision ID: 0005
Revises: 0004
Create Date: 2026-07-15
"""
import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Opportunistically captured server-side copy of the raw E2E key, wrapped with
    # MASTER_ENCRYPTION_KEY the first time the server observes it on an authenticated
    # request (WS chat connect). Lets nightly background jobs (daily/weekly memory
    # compression) decrypt messages without the client being online. Nullable because
    # existing users haven't been "seen" yet — filled in on their next chat connection.
    op.add_column(
        "user_keys",
        sa.Column("server_wrapped_key", sa.LargeBinary(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("user_keys", "server_wrapped_key")
