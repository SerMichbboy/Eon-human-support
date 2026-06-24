"""add E2E key fields and clear server-side encrypted data

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-24
"""
import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Clear all user data — existing keys are master-encrypted (not E2E), unusable after this migration.
    # Users must re-register to get E2E keys.
    op.execute("DELETE FROM messages")
    op.execute("DELETE FROM memory_embeddings")
    op.execute("DELETE FROM weekly_summaries")
    op.execute("DELETE FROM daily_summaries")
    op.execute("DELETE FROM user_profiles")
    op.execute("DELETE FROM companions")
    op.execute("DELETE FROM users")
    op.execute("DELETE FROM user_keys")

    # Add PBKDF2 salt column to user_keys.
    # encrypted_key now stores client-encrypted key (AES-GCM with PBKDF2-derived key).
    # Server cannot decrypt it — only the client can using their password.
    op.add_column("user_keys", sa.Column("salt", sa.LargeBinary(), nullable=False, server_default=r"\x"))
    op.alter_column("user_keys", "salt", server_default=None)


def downgrade() -> None:
    op.drop_column("user_keys", "salt")
