"""
Main entry point for the Telegram bot.
"""
import asyncio
import signal
import sys

from telegram import Update
from telegram.ext import Application, ApplicationBuilder

from bot.config import settings
from bot.db import init_db, close_db
from bot.handlers import (
    get_start_handler,
    get_add_address_handler,
    get_my_addresses_handler,
    get_delete_address_handler,
)
from bot.scheduler import run_monitoring_check
from bot.scraper import DTEKScraper
from bot.utils.logger import configure_logging, get_logger

# Configure logging
configure_logging()
logger = get_logger(__name__)


class BotApplication:
    """Main bot application."""
    
    def __init__(self):
        self.app: Application = None
        self.scraper: DTEKScraper = None
        self.shutdown_event = asyncio.Event()
    
    async def start(self) -> None:
        """Start the bot application."""
        logger.info("Starting bot application")
        
        try:
            # Initialize database
            await init_db()
            
            # Initialize scraper
            logger.info("Initializing Playwright scraper")
            self.scraper = DTEKScraper()
            await self.scraper.start()
            
            # Build application
            self.app = (
                ApplicationBuilder()
                .token(settings.bot_token)
                .build()
            )
            
            # Store scraper in bot_data for access in handlers
            self.app.bot_data["scraper"] = self.scraper
            
            # Register handlers
            self.app.add_handler(get_start_handler())
            self.app.add_handler(get_add_address_handler())
            self.app.add_handler(get_my_addresses_handler())
            self.app.add_handler(get_delete_address_handler())
            
            # Start bot
            await self.app.initialize()
            await self.app.start()
            
            # Start polling
            logger.info("Starting bot polling")
            await self.app.updater.start_polling(
                allowed_updates=Update.ALL_TYPES,
                drop_pending_updates=True
            )
            
            # Schedule monitoring job
            logger.info(
                "Scheduling monitoring job",
                interval_minutes=settings.check_interval_minutes
            )
            
            # Use job_queue for scheduling
            self.app.job_queue.run_repeating(
                self._monitoring_callback,
                interval=settings.check_interval_minutes * 60,
                first=10,  # First run after 10 seconds
                name="monitoring_job"
            )
            
            logger.info("Bot started successfully")
            
            # Wait for shutdown signal
            await self.shutdown_event.wait()
            
        except Exception as e:
            logger.error("Failed to start bot", error=str(e), exc_info=True)
            raise
    
    async def _monitoring_callback(self, context) -> None:
        """Callback for monitoring job."""
        try:
            await run_monitoring_check(context.bot)
        except Exception as e:
            logger.error("Error in monitoring job", error=str(e), exc_info=True)
    
    async def stop(self) -> None:
        """Stop the bot application."""
        logger.info("Stopping bot application")
        
        try:
            if self.app:
                # Stop polling
                if self.app.updater and self.app.updater.running:
                    await self.app.updater.stop()
                
                # Stop application
                await self.app.stop()
                await self.app.shutdown()
            
            # Close scraper
            if self.scraper:
                await self.scraper.close()
            
            # Close database
            await close_db()
            
            logger.info("Bot stopped successfully")
            
        except Exception as e:
            logger.error("Error during shutdown", error=str(e), exc_info=True)
        
        finally:
            self.shutdown_event.set()
    
    def signal_handler(self, signum, frame):
        """Handle shutdown signals."""
        logger.info("Received shutdown signal", signal=signum)
        asyncio.create_task(self.stop())


async def main() -> None:
    """Main function."""
    bot_app = BotApplication()
    
    # Register signal handlers
    signal.signal(signal.SIGINT, lambda s, f: asyncio.create_task(bot_app.stop()))
    signal.signal(signal.SIGTERM, lambda s, f: asyncio.create_task(bot_app.stop()))
    
    try:
        await bot_app.start()
    except KeyboardInterrupt:
        logger.info("Keyboard interrupt received")
        await bot_app.stop()
    except Exception as e:
        logger.error("Unexpected error", error=str(e), exc_info=True)
        await bot_app.stop()
        sys.exit(1)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Application interrupted")
        sys.exit(0)
