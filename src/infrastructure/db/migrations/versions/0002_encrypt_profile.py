"""encrypt profile and companion name fields

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-24
"""
import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Clear existing unencrypted test data before schema change
    op.execute("TRUNCATE messages, daily_summaries, weekly_summaries, memory_embeddings RESTART IDENTITY CASCADE")
    op.execute("UPDATE companions SET name = 'Eon'")  # reset to default, will be re-encrypted on next save

    # Change profile JSONB columns to Text for AES-256-GCM encrypted JSON storage
    op.execute("ALTER TABLE user_profiles ALTER COLUMN basic_info TYPE TEXT USING ''")
    op.execute("ALTER TABLE user_profiles ALTER COLUMN life_context TYPE TEXT USING ''")
    op.execute("ALTER TABLE user_profiles ALTER COLUMN positive_moments TYPE TEXT USING ''")
    op.execute("ALTER TABLE user_profiles ALTER COLUMN struggles TYPE TEXT USING ''")
    op.execute("ALTER TABLE user_profiles ALTER COLUMN key_events TYPE TEXT USING ''")
    op.execute("ALTER TABLE user_profiles ALTER COLUMN companion_preferences TYPE TEXT USING ''")

    op.execute("ALTER TABLE user_profiles ALTER COLUMN basic_info SET DEFAULT ''")
    op.execute("ALTER TABLE user_profiles ALTER COLUMN life_context SET DEFAULT ''")
    op.execute("ALTER TABLE user_profiles ALTER COLUMN positive_moments SET DEFAULT ''")
    op.execute("ALTER TABLE user_profiles ALTER COLUMN struggles SET DEFAULT ''")
    op.execute("ALTER TABLE user_profiles ALTER COLUMN key_events SET DEFAULT ''")
    op.execute("ALTER TABLE user_profiles ALTER COLUMN companion_preferences SET DEFAULT ''")


def downgrade() -> None:
    op.execute("ALTER TABLE user_profiles ALTER COLUMN basic_info TYPE JSONB USING '{}'::jsonb")
    op.execute("ALTER TABLE user_profiles ALTER COLUMN life_context TYPE JSONB USING '{}'::jsonb")
    op.execute("ALTER TABLE user_profiles ALTER COLUMN positive_moments TYPE JSONB USING '{}'::jsonb")
    op.execute("ALTER TABLE user_profiles ALTER COLUMN struggles TYPE JSONB USING '{}'::jsonb")
    op.execute("ALTER TABLE user_profiles ALTER COLUMN key_events TYPE JSONB USING '[]'::jsonb")
    op.execute("ALTER TABLE user_profiles ALTER COLUMN companion_preferences TYPE JSONB USING '{}'::jsonb")
