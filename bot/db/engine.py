"""
Database engine and session management.
"""
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from bot.config import settings
from bot.db.models import Base
from bot.utils.logger import get_logger

logger = get_logger(__name__)


# Global engine and session maker
engine: AsyncEngine = None
async_session_maker: async_sessionmaker[AsyncSession] = None


def create_engine() -> AsyncEngine:
    """Create async database engine."""
    return create_async_engine(
        settings.database_url,
        echo=False,
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=20,
    )


def create_session_maker(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    """Create async session maker."""
    return async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
        autocommit=False,
    )


async def init_db() -> None:
    """Initialize database connection."""
    global engine, async_session_maker
    
    logger.info("Initializing database connection")
    
    try:
        engine = create_engine()
        async_session_maker = create_session_maker(engine)
        
        # Test connection
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error("Failed to initialize database", error=str(e), exc_info=True)
        raise


async def close_db() -> None:
    """Close database connection."""
    global engine
    
    if engine:
        logger.info("Closing database connection")
        await engine.dispose()
        logger.info("Database connection closed")


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Get async database session."""
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
