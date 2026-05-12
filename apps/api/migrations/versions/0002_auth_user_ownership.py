"""auth user ownership v0.1

Revision ID: 0002_auth_user_ownership
Revises: 0001_initial_story_state_engine
Create Date: 2026-05-04
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0002_auth_user_ownership"
down_revision = "0001_initial_story_state_engine"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The v1.0 schema already created users and stories.user_id. This migration
    # is kept for explicit upgrade history and idempotent installs.
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if "users" not in inspector.get_table_names():
        op.create_table(
            "users",
            sa.Column("user_id", sa.Text(), primary_key=True),
            sa.Column("email", sa.Text(), unique=True),
            sa.Column("display_name", sa.Text()),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        )
    story_cols = {c["name"] for c in inspector.get_columns("stories")}
    if "user_id" not in story_cols:
        op.add_column("stories", sa.Column("user_id", sa.Text(), nullable=True))


def downgrade() -> None:
    # Keep user ownership columns on downgrade to avoid orphaning stories.
    pass
