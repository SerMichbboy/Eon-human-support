from datetime import date, datetime
from uuid import UUID

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class UserKeyModel(Base):
    __tablename__ = "user_keys"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    encrypted_key: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    user: Mapped["UserModel"] = relationship(back_populates="encryption_key")


class UserModel(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), unique=True, nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    is_phone_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    encryption_key_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("user_keys.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    encryption_key: Mapped[UserKeyModel] = relationship(back_populates="user")
    companion: Mapped["CompanionModel"] = relationship(back_populates="user", uselist=False)
    profile: Mapped["UserProfileModel"] = relationship(back_populates="user", uselist=False)


class CompanionModel(Base):
    __tablename__ = "companions"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)  # зашифровано
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    user: Mapped[UserModel] = relationship(back_populates="companion")
    messages: Mapped[list["MessageModel"]] = relationship(back_populates="companion")
    daily_summaries: Mapped[list["DailySummaryModel"]] = relationship(back_populates="companion")
    weekly_summaries: Mapped[list["WeeklySummaryModel"]] = relationship(
        back_populates="companion"
    )
    memory_embeddings: Mapped[list["MemoryEmbeddingModel"]] = relationship(
        back_populates="companion"
    )


class UserProfileModel(Base):
    __tablename__ = "user_profiles"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False
    )
    basic_info: Mapped[str] = mapped_column(Text, nullable=False, default="")  # encrypted JSON
    life_context: Mapped[str] = mapped_column(Text, nullable=False, default="")
    positive_moments: Mapped[str] = mapped_column(Text, nullable=False, default="")
    struggles: Mapped[str] = mapped_column(Text, nullable=False, default="")
    key_events: Mapped[str] = mapped_column(Text, nullable=False, default="")
    companion_preferences: Mapped[str] = mapped_column(Text, nullable=False, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    user: Mapped[UserModel] = relationship(back_populates="profile")


class MessageModel(Base):
    __tablename__ = "messages"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    companion_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("companions.id"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)  # зашифровано
    audio_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)

    companion: Mapped[CompanionModel] = relationship(back_populates="messages")


class DailySummaryModel(Base):
    __tablename__ = "daily_summaries"
    __table_args__ = (UniqueConstraint("companion_id", "date"),)

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    companion_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("companions.id"), nullable=False
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)  # зашифровано

    companion: Mapped[CompanionModel] = relationship(back_populates="daily_summaries")


class WeeklySummaryModel(Base):
    __tablename__ = "weekly_summaries"
    __table_args__ = (UniqueConstraint("companion_id", "week_start"),)

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    companion_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("companions.id"), nullable=False
    )
    week_start: Mapped[date] = mapped_column(Date, nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)  # зашифровано

    companion: Mapped[CompanionModel] = relationship(back_populates="weekly_summaries")


class MemoryEmbeddingModel(Base):
    __tablename__ = "memory_embeddings"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    companion_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("companions.id"), nullable=False, index=True
    )
    source_type: Mapped[str] = mapped_column(String(20), nullable=False)
    source_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
    embedding: Mapped[list] = mapped_column(Vector(1536), nullable=False)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)

    companion: Mapped[CompanionModel] = relationship(back_populates="memory_embeddings")
