"""
Monitoring scheduler - periodic checks for power outages.
"""
import asyncio
from datetime import datetime
from typing import Dict, List

from telegram import Bot
from telegram.error import TelegramError

from bot.config import settings
from bot.db import get_session, AddressRepository, ShutdownStateRepository
from bot.db.models import Address, ShutdownState
from bot.scraper import DTEKScraper, ShutdownInfo, get_region_display_name
from bot.utils.logger import get_logger

logger = get_logger(__name__)


class MonitoringService:
    """Service for monitoring power outages."""
    
    def __init__(self, bot: Bot):
        self.bot = bot
    
    async def check_addresses(self) -> None:
        """Check all addresses for power outage status changes."""
        logger.info("Starting monitoring check")
        
        try:
            # Get all addresses
            async for session in get_session():
                addresses = await AddressRepository.get_all_with_states(session)
                
                if not addresses:
                    logger.info("No addresses to check")
                    return
                
                logger.info("Checking addresses", count=len(addresses))
                
                # Group addresses by region for efficiency
                addresses_by_region: Dict[str, List[Address]] = {}
                for address in addresses:
                    region = address.region
                    if region not in addresses_by_region:
                        addresses_by_region[region] = []
                    addresses_by_region[region].append(address)
                
                # Create one scraper for all checks
                async with DTEKScraper() as scraper:
                    for region, region_addresses in addresses_by_region.items():
                        logger.info("Checking region", region=region, count=len(region_addresses))
                        
                        for address in region_addresses:
                            try:
                                await self._check_single_address(session, scraper, address)
                            except Exception as e:
                                logger.error(
                                    "Error checking address",
                                    address_id=address.id,
                                    error=str(e),
                                    exc_info=True
                                )
                                continue
                
                logger.info("Monitoring check completed")
                
        except Exception as e:
            logger.error("Error in monitoring check", error=str(e), exc_info=True)
    
    async def _check_single_address(
        self,
        session,
        scraper: DTEKScraper,
        address: Address
    ) -> None:
        """Check a single address for status changes."""
        try:
            # Get current status from website
            shutdown_info = await scraper.get_shutdown_info(
                region=address.region,
                settlement=address.settlement,
                street=address.street,
                house=address.house
            )
            
            # Get or create shutdown state
            state = await ShutdownStateRepository.get_or_create(session, address.id)
            
            # Check for changes
            changes = self._detect_changes(state, shutdown_info)
            
            if changes:
                logger.info(
                    "Status changed",
                    address_id=address.id,
                    changes=changes
                )
                
                # Send notification
                await self._send_notification(address, state, shutdown_info, changes)
            
            # Update state in database
            await ShutdownStateRepository.update(
                session=session,
                state=state,
                shutdown_type=shutdown_info.shutdown_type,
                start_time=shutdown_info.start_time,
                end_time=shutdown_info.end_time,
                is_active=shutdown_info.is_active
            )
            
            await session.commit()
            
        except Exception as e:
            logger.error(
                "Error checking single address",
                address_id=address.id,
                error=str(e),
                exc_info=True
            )
            raise
    
    def _detect_changes(
        self,
        old_state: ShutdownState,
        new_info: ShutdownInfo
    ) -> List[str]:
        """Detect what changed between old and new state."""
        changes = []
        
        # Check if shutdown started
        if not old_state.is_active and new_info.is_active:
            changes.append("started")
        
        # Check if shutdown ended
        elif old_state.is_active and not new_info.is_active:
            changes.append("ended")
        
        # Check if time changed (while still active)
        elif old_state.is_active and new_info.is_active:
            # Check end time change
            if old_state.end_time != new_info.end_time:
                changes.append("time_updated")
            
            # Check shutdown type change
            if old_state.shutdown_type != new_info.shutdown_type:
                changes.append("type_changed")
        
        return changes
    
    async def _send_notification(
        self,
        address: Address,
        old_state: ShutdownState,
        new_info: ShutdownInfo,
        changes: List[str]
    ) -> None:
        """Send notification to user about status change."""
        try:
            telegram_id = address.user.telegram_id
            
            # Build notification message
            if "started" in changes:
                message = self._build_start_message(address, new_info)
            elif "ended" in changes:
                message = self._build_end_message(address)
            elif "time_updated" in changes:
                message = self._build_update_message(address, new_info)
            else:
                # Other changes - just log, don't notify
                return
            
            # Send message
            await self.bot.send_message(
                chat_id=telegram_id,
                text=message,
                parse_mode="Markdown"
            )
            
            logger.info(
                "Notification sent",
                telegram_id=telegram_id,
                address_id=address.id,
                changes=changes
            )
            
        except TelegramError as e:
            logger.error(
                "Failed to send notification",
                telegram_id=address.user.telegram_id,
                error=str(e),
                exc_info=True
            )
        except Exception as e:
            logger.error(
                "Unexpected error sending notification",
                error=str(e),
                exc_info=True
            )
    
    def _build_start_message(self, address: Address, info: ShutdownInfo) -> str:
        """Build message for shutdown start."""
        message = "⚡️ *Увага! Відключення електроенергії*\n\n"
        message += f"📍 *Адреса:* {address.full_address}\n"
        message += f"🏙️ *Регіон:* {get_region_display_name(address.region)}\n\n"
        
        if info.shutdown_type == "аварійне":
            message += "🔴 *Тип:* Аварійне відключення\n"
        elif info.shutdown_type == "планове":
            message += "🟡 *Тип:* Планове відключення\n"
        
        if info.start_time:
            message += f"🕐 *Початок:* {info.start_time.strftime('%d.%m %H:%M')}\n"
        if info.end_time:
            message += f"🕐 *Орієнтовне завершення:* {info.end_time.strftime('%d.%m %H:%M')}\n"
        
        return message
    
    def _build_end_message(self, address: Address) -> str:
        """Build message for shutdown end."""
        message = "✅ *Електроенергію відновлено!*\n\n"
        message += f"📍 *Адреса:* {address.full_address}\n"
        message += f"🏙️ *Регіон:* {get_region_display_name(address.region)}\n"
        
        return message
    
    def _build_update_message(self, address: Address, info: ShutdownInfo) -> str:
        """Build message for shutdown time update."""
        message = "🔄 *Зміна графіку відключення*\n\n"
        message += f"📍 *Адреса:* {address.full_address}\n"
        message += f"🏙️ *Регіон:* {get_region_display_name(address.region)}\n\n"
        
        if info.end_time:
            message += f"🕐 *Новий час завершення:* {info.end_time.strftime('%d.%m %H:%M')}\n"
        
        return message


async def run_monitoring_check(bot: Bot) -> None:
    """Run a single monitoring check cycle."""
    service = MonitoringService(bot)
    await service.check_addresses()
