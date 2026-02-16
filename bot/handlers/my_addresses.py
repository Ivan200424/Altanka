"""
My addresses handler - show saved address and current status.
"""
from telegram import Update
from telegram.ext import ContextTypes, MessageHandler, filters

from bot.db import get_session, UserRepository, AddressRepository
from bot.scraper import get_region_display_name
from bot.utils.logger import get_logger

logger = get_logger(__name__)


async def my_addresses_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle 'My addresses' button - show saved address and status."""
    user = update.effective_user
    logger.info("My addresses command", user_id=user.id)
    
    try:
        async for session in get_session():
            # Get user
            user_obj = await UserRepository.get_by_telegram_id(session, user.id)
            
            if not user_obj:
                await update.message.reply_text(
                    "У вас ще немає збережених адрес.\n\n"
                    "Використайте '📍 Додати адресу' щоб додати адресу для моніторингу."
                )
                return
            
            # Get address
            address = await AddressRepository.get_by_user_id(session, user_obj.id)
            
            if not address:
                await update.message.reply_text(
                    "У вас ще немає збережених адрес.\n\n"
                    "Використайте '📍 Додати адресу' щоб додати адресу для моніторингу."
                )
                return
            
            # Build response
            response = "📍 *Ваша адреса:*\n"
            response += f"{get_region_display_name(address.region)}\n"
            response += f"{address.full_address}\n\n"
            
            # Show current status if available
            if address.shutdown_state:
                state = address.shutdown_state
                
                if state.is_active:
                    if state.shutdown_type == "аварійне":
                        response += "⚡️ *Статус:* 🔴 Аварійне відключення\n"
                    elif state.shutdown_type == "планове":
                        response += "⚡️ *Статус:* 🟡 Планове відключення\n"
                    else:
                        response += "⚡️ *Статус:* Відключення\n"
                    
                    if state.start_time:
                        response += f"🕐 Початок: {state.start_time.strftime('%d.%m %H:%M')}\n"
                    if state.end_time:
                        response += f"🕐 Завершення: {state.end_time.strftime('%d.%m %H:%M')}\n"
                else:
                    response += "✅ *Статус:* Немає відключень\n"
                
                if state.last_checked_at:
                    response += f"\n🔄 Остання перевірка: {state.last_checked_at.strftime('%d.%m %H:%M')}\n"
            else:
                response += "ℹ️ Статус ще не перевірявся. Очікуйте наступної перевірки.\n"
            
            await update.message.reply_text(response, parse_mode="Markdown")
            
    except Exception as e:
        logger.error("Error in my_addresses", error=str(e), exc_info=True)
        await update.message.reply_text(
            "❌ Сталася помилка при отриманні даних. Спробуйте пізніше."
        )


def get_my_addresses_handler() -> MessageHandler:
    """Get my addresses handler."""
    return MessageHandler(filters.Regex("^📋 Мої адреси$"), my_addresses_command)
