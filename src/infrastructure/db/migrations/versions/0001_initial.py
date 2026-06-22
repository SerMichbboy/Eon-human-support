"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-06-22
"""
import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "user_keys",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("encrypted_key", sa.LargeBinary, nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )

    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), unique=True, nullable=True),
        sa.Column("phone", sa.String(20), unique=True, nullable=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("is_email_verified", sa.Boolean, server_default="false", nullable=False),
        sa.Column("is_phone_verified", sa.Boolean, server_default="false", nullable=False),
        sa.Column(
            "encryption_key_id",
            UUID(as_uuid=True),
            sa.ForeignKey("user_keys.id"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )

    op.create_table(
        "companions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            unique=True,
            nullable=False,
        ),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )

    op.create_table(
        "user_profiles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            unique=True,
            nullable=False,
        ),
        sa.Column("basic_info", JSONB, server_default="{}"),
        sa.Column("life_context", JSONB, server_default="{}"),
        sa.Column("positive_moments", JSONB, server_default="{}"),
        sa.Column("struggles", JSONB, server_default="{}"),
        sa.Column("key_events", JSONB, server_default="[]"),
        sa.Column("companion_preferences", JSONB, server_default="{}"),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )

    op.create_table(
        "messages",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "companion_id",
            UUID(as_uuid=True),
            sa.ForeignKey("companions.id"),
            nullable=False,
        ),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("audio_url", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_messages_companion_created", "messages", ["companion_id", "created_at"])

    op.create_table(
        "daily_summaries",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "companion_id",
            UUID(as_uuid=True),
            sa.ForeignKey("companions.id"),
            nullable=False,
        ),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("summary", sa.Text, nullable=False),
        sa.UniqueConstraint("companion_id", "date", name="uq_daily_companion_date"),
    )

    op.create_table(
        "weekly_summaries",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "companion_id",
            UUID(as_uuid=True),
            sa.ForeignKey("companions.id"),
            nullable=False,
        ),
        sa.Column("week_start", sa.Date, nullable=False),
        sa.Column("summary", sa.Text, nullable=False),
        sa.UniqueConstraint("companion_id", "week_start", name="uq_weekly_companion_week"),
    )

    op.create_table(
        "memory_embeddings",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "companion_id",
            UUID(as_uuid=True),
            sa.ForeignKey("companions.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("source_type", sa.String(20), nullable=False),
        sa.Column("source_id", UUID(as_uuid=True), nullable=False),
        sa.Column("embedding", Vector(1536), nullable=False),
        sa.Column("period_start", sa.Date, nullable=False),
        sa.Column("period_end", sa.Date, nullable=False),
    )
    op.execute(
        "CREATE INDEX ix_memory_embeddings_ivfflat "
        "ON memory_embeddings USING ivfflat (embedding vector_cosine_ops) "
        "WITH (lists = 100)"
    )


def downgrade() -> None:
    op.drop_table("memory_embeddings")
    op.drop_table("weekly_summaries")
    op.drop_table("daily_summaries")
    op.drop_table("messages")
    op.drop_table("user_profiles")
    op.drop_table("companions")
    op.drop_table("users")
    op.drop_table("user_keys")
    op.execute("DROP EXTENSION IF EXISTS vector")
