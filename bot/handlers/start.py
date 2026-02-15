"""
Start command handler - shows main menu with reply keyboard.
"""
from telegram import Update, ReplyKeyboardMarkup, KeyboardButton
from telegram.ext import ContextTypes, CommandHandler

from bot.utils.logger import get_logger

logger = get_logger(__name__)


async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /start command."""
    user = update.effective_user
    logger.info("Start command received", user_id=user.id, username=user.username)
    
    # Create reply keyboard with buttons
    keyboard = [
        [KeyboardButton("📍 Додати адресу")],
        [KeyboardButton("📋 Мої адреси")],
        [KeyboardButton("🗑 Видалити адресу")],
    ]
    reply_markup = ReplyKeyboardMarkup(
        keyboard,
        resize_keyboard=True,
        one_time_keyboard=False
    )
    
    welcome_text = (
        "👋 Вітаю! Я бот для моніторингу відключень електроенергії ДТЕК.\n\n"
        "📍 *Додати адресу* — підписатися на сповіщення про відключення\n"
        "📋 *Мої адреси* — переглянути збережену адресу та поточний статус\n"
        "🗑 *Видалити адресу* — видалити адресу та відписатися\n\n"
        "Оберіть дію за допомогою кнопок нижче:"
    )
    
    await update.message.reply_text(
        welcome_text,
        reply_markup=reply_markup,
        parse_mode="Markdown"
    )


def get_start_handler() -> CommandHandler:
    """Get start command handler."""
    return CommandHandler("start", start_command)
