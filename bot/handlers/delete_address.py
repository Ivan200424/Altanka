"""
Delete address handler - delete saved address with confirmation.
"""
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    ContextTypes,
    ConversationHandler,
    MessageHandler,
    CallbackQueryHandler,
    filters,
)

from bot.db import get_session, UserRepository, AddressRepository
from bot.scraper import get_region_display_name
from bot.utils.logger import get_logger

logger = get_logger(__name__)

# Conversation states
CONFIRM_DELETE = 0


async def delete_address_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Start delete address conversation - show address and ask for confirmation."""
    user = update.effective_user
    logger.info("Delete address started", user_id=user.id)
    
    try:
        async for session in get_session():
            # Get user
            user_obj = await UserRepository.get_by_telegram_id(session, user.id)
            
            if not user_obj:
                await update.message.reply_text(
                    "У вас немає збережених адрес."
                )
                return ConversationHandler.END
            
            # Get address
            address = await AddressRepository.get_by_user_id(session, user_obj.id)
            
            if not address:
                await update.message.reply_text(
                    "У вас немає збережених адрес."
                )
                return ConversationHandler.END
            
            # Store address ID in context
            context.user_data["delete_address_id"] = address.id
            
            # Show address and ask for confirmation
            response = "🗑 *Видалити адресу?*\n\n"
            response += "📍 Адреса:\n"
            response += f"{get_region_display_name(address.region)}\n"
            response += f"{address.full_address}\n\n"
            response += "⚠️ Якщо ви видалите адресу, ви більше не будете отримувати сповіщення про відключення електроенергії.\n\n"
            response += "Підтвердити видалення?"
            
            keyboard = [
                [InlineKeyboardButton("✅ Так, видалити", callback_data="delete_confirm")],
                [InlineKeyboardButton("❌ Ні, скасувати", callback_data="delete_cancel")],
            ]
            reply_markup = InlineKeyboardMarkup(keyboard)
            
            await update.message.reply_text(
                response,
                reply_markup=reply_markup,
                parse_mode="Markdown"
            )
            
            return CONFIRM_DELETE
            
    except Exception as e:
        logger.error("Error in delete_address_start", error=str(e), exc_info=True)
        await update.message.reply_text(
            "❌ Сталася помилка. Спробуйте пізніше."
        )
        return ConversationHandler.END


async def confirm_delete(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Handle delete confirmation."""
    query = update.callback_query
    await query.answer()
    
    if query.data == "delete_cancel":
        await query.edit_message_text("❌ Видалення адреси скасовано.")
        return ConversationHandler.END
    
    # Delete address
    user = update.effective_user
    address_id = context.user_data.get("delete_address_id")
    
    if not address_id:
        await query.edit_message_text("❌ Помилка: адреса не знайдена.")
        return ConversationHandler.END
    
    try:
        async for session in get_session():
            # Get user
            user_obj = await UserRepository.get_by_telegram_id(session, user.id)
            
            if not user_obj:
                await query.edit_message_text("❌ Помилка: користувач не знайдений.")
                return ConversationHandler.END
            
            # Get address
            address = await AddressRepository.get_by_user_id(session, user_obj.id)
            
            if not address or address.id != address_id:
                await query.edit_message_text("❌ Помилка: адреса не знайдена.")
                return ConversationHandler.END
            
            # Delete address
            await AddressRepository.delete(session, address)
            
            logger.info(
                "Address deleted",
                user_id=user.id,
                address_id=address.id
            )
        
        await query.edit_message_text(
            "✅ Адресу успішно видалено.\n\n"
            "Ви більше не будете отримувати сповіщення про відключення електроенергії.\n\n"
            "Використайте '📍 Додати адресу' щоб додати нову адресу для моніторингу."
        )
        
    except Exception as e:
        logger.error("Error deleting address", error=str(e), exc_info=True)
        await query.edit_message_text(
            "❌ Сталася помилка при видаленні адреси. Спробуйте пізніше."
        )
    
    return ConversationHandler.END


def get_delete_address_handler() -> ConversationHandler:
    """Get delete address conversation handler."""
    return ConversationHandler(
        entry_points=[
            MessageHandler(filters.Regex("^🗑 Видалити адресу$"), delete_address_start)
        ],
        states={
            CONFIRM_DELETE: [
                CallbackQueryHandler(confirm_delete)
            ],
        },
        fallbacks=[],
        conversation_timeout=300,  # 5 minutes timeout
    )
