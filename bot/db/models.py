"""
SQLAlchemy ORM models for the database.
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, Boolean, String, Text, DateTime, Integer, ForeignKey
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.sql import func


class Base(DeclarativeBase):
    """Base class for all models."""
    pass


class User(Base):
    """User model."""
    __tablename__ = "users"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    telegram_id: Mapped[int] = mapped_column(BigInteger, unique=True, nullable=False, index=True)
    username: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        server_default=func.now(),
        nullable=False
    )
    
    # Relationships
    addresses: Mapped[list["Address"]] = relationship(
        "Address", 
        back_populates="user",
        cascade="all, delete-orphan"
    )


class Address(Base):
    """Address model."""
    __tablename__ = "addresses"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, 
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False
    )
    region: Mapped[str] = mapped_column(String(50), nullable=False)
    settlement: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    street: Mapped[str] = mapped_column(String(255), nullable=False)
    house: Mapped[str] = mapped_column(String(50), nullable=False)
    full_address: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    
    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="addresses")
    shutdown_state: Mapped[Optional["ShutdownState"]] = relationship(
        "ShutdownState",
        back_populates="address",
        cascade="all, delete-orphan",
        uselist=False
    )
    
    __table_args__ = (
        # One address per user constraint
        {"schema": None}
    )


class ShutdownState(Base):
    """Shutdown state model for tracking power outage status."""
    __tablename__ = "shutdown_states"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    address_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("addresses.id", ondelete="CASCADE"),
        unique=True,
        nullable=False
    )
    shutdown_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    start_time: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )
    end_time: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    last_checked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )
    
    # Relationships
    address: Mapped["Address"] = relationship("Address", back_populates="shutdown_state")
