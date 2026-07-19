"""replace ivfflat index on memory_embeddings.embedding with hnsw

Revision ID: 0006
Revises: 0005
Create Date: 2026-07-19
"""
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 0001_initial created `ix_memory_embeddings_ivfflat` (ivfflat, lists=100) —
    # but ivfflat clusters centroids from whatever rows exist *at CREATE INDEX
    # time*, which in a migration means an empty table: the "lists=100" clustering
    # was trained on 0 rows and is meaningless until someone manually REINDEXes
    # after real data accumulates, which nothing in this codebase does. HNSW has
    # no such training step — it builds incrementally as rows are inserted, so it
    # stays meaningful without any maintenance job. search()
    # (src/infrastructure/db/repositories/memory.py) already filters by
    # companion_id first (btree-indexed) before sorting by cosine_distance, so a
    # single companion's own row count is what this index actually helps with —
    # daily/weekly summaries are never pruned (see generate_weekly_summary.py),
    # so that count only grows for as long as a companion keeps using Eon.
    op.execute("DROP INDEX IF EXISTS ix_memory_embeddings_ivfflat")
    op.execute(
        "CREATE INDEX ix_memory_embeddings_hnsw "
        "ON memory_embeddings USING hnsw (embedding vector_cosine_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_memory_embeddings_hnsw")
    op.execute(
        "CREATE INDEX ix_memory_embeddings_ivfflat "
        "ON memory_embeddings USING ivfflat (embedding vector_cosine_ops) "
        "WITH (lists = 100)"
    )
