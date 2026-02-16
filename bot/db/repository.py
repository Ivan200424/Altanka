"""
Repository for CRUD operations on database models.
"""
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from bot.db.models import User, Address, ShutdownState
from bot.utils.logger import get_logger

logger = get_logger(__name__)


class UserRepository:
    """Repository for User model."""
    
    @staticmethod
    async def get_or_create(
        session: AsyncSession,
        telegram_id: int,
        username: Optional[str] = None
    ) -> User:
        """Get existing user or create new one."""
        stmt = select(User).where(User.telegram_id == telegram_id)
        result = await session.execute(stmt)
        user = result.scalar_one_or_none()
        
        if not user:
            user = User(telegram_id=telegram_id, username=username)
            session.add(user)
            await session.flush()
            logger.info("Created new user", telegram_id=telegram_id, user_id=user.id)
        elif username and user.username != username:
            user.username = username
            await session.flush()
            logger.info("Updated username", telegram_id=telegram_id, username=username)
        
        return user
    
    @staticmethod
    async def get_by_telegram_id(
        session: AsyncSession,
        telegram_id: int
    ) -> Optional[User]:
        """Get user by telegram ID."""
        stmt = select(User).where(User.telegram_id == telegram_id)
        result = await session.execute(stmt)
        return result.scalar_one_or_none()


class AddressRepository:
    """Repository for Address model."""
    
    @staticmethod
    async def create(
        session: AsyncSession,
        user_id: int,
        region: str,
        settlement: Optional[str],
        street: str,
        house: str,
        full_address: str
    ) -> Address:
        """Create new address."""
        address = Address(
            user_id=user_id,
            region=region,
            settlement=settlement,
            street=street,
            house=house,
            full_address=full_address
        )
        session.add(address)
        await session.flush()
        logger.info("Created address", address_id=address.id, user_id=user_id)
        return address
    
    @staticmethod
    async def get_by_user_id(
        session: AsyncSession,
        user_id: int
    ) -> Optional[Address]:
        """Get address by user ID."""
        stmt = (
            select(Address)
            .where(Address.user_id == user_id)
            .options(selectinload(Address.shutdown_state))
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()
    
    @staticmethod
    async def delete(session: AsyncSession, address: Address) -> None:
        """Delete address."""
        logger.info("Deleting address", address_id=address.id, user_id=address.user_id)
        await session.delete(address)
        await session.flush()
    
    @staticmethod
    async def get_all_with_states(session: AsyncSession) -> list[Address]:
        """Get all addresses with their shutdown states."""
        stmt = (
            select(Address)
            .options(
                selectinload(Address.shutdown_state),
                selectinload(Address.user)
            )
        )
        result = await session.execute(stmt)
        return list(result.scalars().all())


class ShutdownStateRepository:
    """Repository for ShutdownState model."""
    
    @staticmethod
    async def get_or_create(
        session: AsyncSession,
        address_id: int
    ) -> ShutdownState:
        """Get existing shutdown state or create new one."""
        stmt = select(ShutdownState).where(ShutdownState.address_id == address_id)
        result = await session.execute(stmt)
        state = result.scalar_one_or_none()
        
        if not state:
            state = ShutdownState(address_id=address_id, is_active=False)
            session.add(state)
            await session.flush()
            logger.info("Created shutdown state", address_id=address_id)
        
        return state
    
    @staticmethod
    async def update(
        session: AsyncSession,
        state: ShutdownState,
        shutdown_type: Optional[str],
        start_time: Optional["datetime"],
        end_time: Optional["datetime"],
        is_active: bool
    ) -> None:
        """Update shutdown state."""
        from datetime import datetime
        
        state.shutdown_type = shutdown_type
        state.start_time = start_time
        state.end_time = end_time
        state.is_active = is_active
        await session.flush()
        logger.info(
            "Updated shutdown state",
            address_id=state.address_id,
            is_active=is_active,
            shutdown_type=shutdown_type
        )
