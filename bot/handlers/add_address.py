"""
Add address conversation handler - multi-step process for adding address.
"""
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    ContextTypes,
    ConversationHandler,
    MessageHandler,
    CallbackQueryHandler,
    filters,
)

from bot.db import get_session, UserRepository, AddressRepository, ShutdownStateRepository
from bot.scraper import DTEKScraper, REGION_DISPLAY_NAMES, get_region_display_name
from bot.utils.logger import get_logger

logger = get_logger(__name__)

# Conversation states
SELECT_REGION, INPUT_SETTLEMENT, SELECT_SETTLEMENT, INPUT_STREET, SELECT_STREET, SELECT_HOUSE, CONFIRM = range(7)


async def add_address_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Start add address conversation - show region selection."""
    user = update.effective_user
    logger.info("Add address started", user_id=user.id)
    
    # Check if user already has an address
    async for session in get_session():
        user_obj = await UserRepository.get_or_create(
            session, user.id, user.username
        )
        existing_address = await AddressRepository.get_by_user_id(session, user_obj.id)
        
        if existing_address:
            await update.message.reply_text(
                "❌ У вас вже є збережена адреса!\n\n"
                f"📍 {existing_address.full_address}\n\n"
                "Ви можете мати тільки одну адресу. "
                "Використайте '🗑 Видалити адресу' щоб видалити поточну адресу, "
                "а потім додайте нову."
            )
            return ConversationHandler.END
    
    # Show region selection
    keyboard = [
        [InlineKeyboardButton(REGION_DISPLAY_NAMES["київ"], callback_data="region_київ")],
        [InlineKeyboardButton(REGION_DISPLAY_NAMES["київщина"], callback_data="region_київщина")],
        [InlineKeyboardButton(REGION_DISPLAY_NAMES["дніпропетровщина"], callback_data="region_дніпропетровщина")],
        [InlineKeyboardButton(REGION_DISPLAY_NAMES["одещина"], callback_data="region_одещина")],
        [InlineKeyboardButton("❌ Скасувати", callback_data="cancel")],
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await update.message.reply_text(
        "Оберіть регіон:",
        reply_markup=reply_markup
    )
    
    return SELECT_REGION


async def select_region(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Handle region selection."""
    query = update.callback_query
    await query.answer()
    
    if query.data == "cancel":
        await query.edit_message_text("❌ Додавання адреси скасовано.")
        return ConversationHandler.END
    
    region = query.data.replace("region_", "")
    context.user_data["region"] = region
    
    logger.info("Region selected", region=region, user_id=update.effective_user.id)
    
    # For Kyiv, go directly to street input
    if region == "київ":
        await query.edit_message_text(
            f"Регіон: {get_region_display_name(region)}\n\n"
            "Введіть назву вулиці (наприклад: Хрещатик):"
        )
        return INPUT_STREET
    else:
        # For other regions, ask for settlement
        await query.edit_message_text(
            f"Регіон: {get_region_display_name(region)}\n\n"
            "Введіть назву населеного пункту (наприклад: Бровари):"
        )
        return INPUT_SETTLEMENT


async def input_settlement(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Handle settlement input and show options."""
    settlement_text = update.message.text.strip()
    region = context.user_data["region"]
    
    logger.info("Settlement input", settlement=settlement_text, user_id=update.effective_user.id)
    
    # Show loading message
    loading_msg = await update.message.reply_text("🔍 Шукаю варіанти...")
    
    try:
        # Get autocomplete options
        scraper = context.bot_data.get("scraper")
        if not scraper:
            await loading_msg.edit_text("❌ Помилка: скрапер не ініціалізовано. Спробуйте пізніше.")
            return ConversationHandler.END
        
        options = await scraper.get_autocomplete_options(
            region=region,
            field_type="settlement",
            search_text=settlement_text
        )
        
        if not options:
            await loading_msg.edit_text(
                "❌ Населений пункт не знайдено. Спробуйте інший варіант або перевірте правопис.\n\n"
                "Введіть назву населеного пункту:"
            )
            return INPUT_SETTLEMENT
        
        # Store options in context
        context.user_data["settlement_options"] = {
            str(i): opt.value for i, opt in enumerate(options)
        }
        
        # Show options as inline keyboard
        keyboard = []
        for i, opt in enumerate(options[:10]):  # Show max 10 options
            keyboard.append([InlineKeyboardButton(opt.display_text, callback_data=f"settlement_{i}")])
        keyboard.append([InlineKeyboardButton("❌ Скасувати", callback_data="cancel")])
        
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        await loading_msg.edit_text(
            "Оберіть населений пункт зі списку:",
            reply_markup=reply_markup
        )
        
        return SELECT_SETTLEMENT
        
    except Exception as e:
        logger.error("Error getting settlement options", error=str(e), exc_info=True)
        await loading_msg.edit_text(
            "❌ Сталася помилка при отриманні варіантів. Спробуйте ще раз.\n\n"
            "Введіть назву населеного пункту:"
        )
        return INPUT_SETTLEMENT


async def select_settlement(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Handle settlement selection."""
    query = update.callback_query
    await query.answer()
    
    if query.data == "cancel":
        await query.edit_message_text("❌ Додавання адреси скасовано.")
        return ConversationHandler.END
    
    option_index = query.data.replace("settlement_", "")
    settlement = context.user_data["settlement_options"][option_index]
    context.user_data["settlement"] = settlement
    
    logger.info("Settlement selected", settlement=settlement, user_id=update.effective_user.id)
    
    await query.edit_message_text(
        f"Населений пункт: {settlement}\n\n"
        "Введіть назву вулиці (наприклад: Київська):"
    )
    
    return INPUT_STREET


async def input_street(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Handle street input and show options."""
    street_text = update.message.text.strip()
    region = context.user_data["region"]
    settlement = context.user_data.get("settlement")
    
    logger.info("Street input", street=street_text, user_id=update.effective_user.id)
    
    # Show loading message
    loading_msg = await update.message.reply_text("🔍 Шукаю варіанти...")
    
    try:
        # Get autocomplete options
        scraper = context.bot_data.get("scraper")
        if not scraper:
            await loading_msg.edit_text("❌ Помилка: скрапер не ініціалізовано. Спробуйте пізніше.")
            return ConversationHandler.END
        
        options = await scraper.get_autocomplete_options(
            region=region,
            field_type="street",
            search_text=street_text,
            settlement=settlement
        )
        
        if not options:
            await loading_msg.edit_text(
                "❌ Вулицю не знайдено. Спробуйте інший варіант або перевірте правопис.\n\n"
                "Введіть назву вулиці:"
            )
            return INPUT_STREET
        
        # Store options in context
        context.user_data["street_options"] = {
            str(i): opt.value for i, opt in enumerate(options)
        }
        
        # Show options as inline keyboard
        keyboard = []
        for i, opt in enumerate(options[:10]):  # Show max 10 options
            keyboard.append([InlineKeyboardButton(opt.display_text, callback_data=f"street_{i}")])
        keyboard.append([InlineKeyboardButton("❌ Скасувати", callback_data="cancel")])
        
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        await loading_msg.edit_text(
            "Оберіть вулицю зі списку:",
            reply_markup=reply_markup
        )
        
        return SELECT_STREET
        
    except Exception as e:
        logger.error("Error getting street options", error=str(e), exc_info=True)
        await loading_msg.edit_text(
            "❌ Сталася помилка при отриманні варіантів. Спробуйте ще раз.\n\n"
            "Введіть назву вулиці:"
        )
        return INPUT_STREET


async def select_street(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Handle street selection and show house number options."""
    query = update.callback_query
    await query.answer()
    
    if query.data == "cancel":
        await query.edit_message_text("❌ Додавання адреси скасовано.")
        return ConversationHandler.END
    
    option_index = query.data.replace("street_", "")
    street = context.user_data["street_options"][option_index]
    context.user_data["street"] = street
    
    logger.info("Street selected", street=street, user_id=update.effective_user.id)
    
    # Show loading message
    await query.edit_message_text("🔍 Отримую доступні номери будинків...")
    
    try:
        region = context.user_data["region"]
        settlement = context.user_data.get("settlement")
        
        # Get house number options
        scraper = context.bot_data.get("scraper")
        if not scraper:
            await query.edit_message_text("❌ Помилка: скрапер не ініціалізовано. Спробуйте пізніше.")
            return ConversationHandler.END
        
        # For house numbers, we typically search with empty string to get all available
        options = await scraper.get_autocomplete_options(
            region=region,
            field_type="house",
            search_text="",
            settlement=settlement
        )
        
        if not options:
            # If no options, ask user to input manually
            await query.edit_message_text(
                f"Вулиця: {street}\n\n"
                "Введіть номер будинку:"
            )
            context.user_data["manual_house"] = True
            return SELECT_HOUSE
        
        # Store options in context
        context.user_data["house_options"] = {
            str(i): opt.value for i, opt in enumerate(options)
        }
        
        # Show options as inline keyboard (in grid format for numbers)
        keyboard = []
        row = []
        for i, opt in enumerate(options[:30]):  # Show max 30 options
            row.append(InlineKeyboardButton(opt.display_text, callback_data=f"house_{i}"))
            if len(row) == 3:  # 3 buttons per row
                keyboard.append(row)
                row = []
        if row:
            keyboard.append(row)
        keyboard.append([InlineKeyboardButton("❌ Скасувати", callback_data="cancel")])
        
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        await query.edit_message_text(
            f"Вулиця: {street}\n\n"
            "Оберіть номер будинку:",
            reply_markup=reply_markup
        )
        
        return SELECT_HOUSE
        
    except Exception as e:
        logger.error("Error getting house options", error=str(e), exc_info=True)
        await query.edit_message_text(
            f"Вулиця: {street}\n\n"
            "❌ Не вдалося отримати номери будинків. Введіть номер вручну:"
        )
        context.user_data["manual_house"] = True
        return SELECT_HOUSE


async def select_house(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Handle house number selection or input."""
    if update.callback_query:
        query = update.callback_query
        await query.answer()
        
        if query.data == "cancel":
            await query.edit_message_text("❌ Додавання адреси скасовано.")
            return ConversationHandler.END
        
        option_index = query.data.replace("house_", "")
        house = context.user_data["house_options"][option_index]
        
        # Show loading message
        await query.edit_message_text("🔍 Перевіряю статус відключень...")
        message = query.message
    else:
        # Manual input
        house = update.message.text.strip()
        message = await update.message.reply_text("🔍 Перевіряю статус відключень...")
    
    context.user_data["house"] = house
    
    logger.info("House selected", house=house, user_id=update.effective_user.id)
    
    try:
        region = context.user_data["region"]
        settlement = context.user_data.get("settlement")
        street = context.user_data["street"]
        
        # Get shutdown info
        scraper = context.bot_data.get("scraper")
        if not scraper:
            await message.edit_text("❌ Помилка: скрапер не ініціалізовано. Спробуйте пізніше.")
            return ConversationHandler.END
        
        shutdown_info = await scraper.get_shutdown_info(
            region=region,
            settlement=settlement,
            street=street,
            house=house
        )
        
        # Store shutdown info
        context.user_data["shutdown_info"] = shutdown_info
        
        # Build full address
        if settlement:
            full_address = f"{settlement}, {street}, {house}"
        else:
            full_address = f"{street}, {house}"
        
        context.user_data["full_address"] = full_address
        
        # Show status and ask for confirmation
        status_text = "📍 *Адреса:*\n"
        status_text += f"{get_region_display_name(region)}\n"
        status_text += f"{full_address}\n\n"
        
        if shutdown_info.is_active:
            if shutdown_info.shutdown_type == "аварійне":
                status_text += "⚡️ *Статус:* 🔴 Аварійне відключення\n"
            elif shutdown_info.shutdown_type == "планове":
                status_text += "⚡️ *Статус:* 🟡 Планове відключення\n"
            
            if shutdown_info.start_time:
                status_text += f"🕐 Початок: {shutdown_info.start_time.strftime('%d.%m %H:%M')}\n"
            if shutdown_info.end_time:
                status_text += f"🕐 Завершення: {shutdown_info.end_time.strftime('%d.%m %H:%M')}\n"
        else:
            status_text += "✅ *Статус:* Немає відключень\n"
        
        status_text += "\n💡 Підтвердити моніторинг цієї адреси?"
        
        keyboard = [
            [InlineKeyboardButton("✅ Так, підтвердити", callback_data="confirm_yes")],
            [InlineKeyboardButton("❌ Ні, скасувати", callback_data="confirm_no")],
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        await message.edit_text(
            status_text,
            reply_markup=reply_markup,
            parse_mode="Markdown"
        )
        
        return CONFIRM
        
    except Exception as e:
        logger.error("Error getting shutdown info", error=str(e), exc_info=True)
        await message.edit_text(
            "❌ Сталася помилка при перевірці статусу. Спробуйте пізніше або оберіть іншу адресу."
        )
        return ConversationHandler.END


async def confirm_address(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Handle address confirmation."""
    query = update.callback_query
    await query.answer()
    
    if query.data == "confirm_no":
        await query.edit_message_text("❌ Додавання адреси скасовано.")
        return ConversationHandler.END
    
    # Save address to database
    user = update.effective_user
    
    try:
        async for session in get_session():
            # Get or create user
            user_obj = await UserRepository.get_or_create(
                session, user.id, user.username
            )
            
            # Create address
            address = await AddressRepository.create(
                session=session,
                user_id=user_obj.id,
                region=context.user_data["region"],
                settlement=context.user_data.get("settlement"),
                street=context.user_data["street"],
                house=context.user_data["house"],
                full_address=context.user_data["full_address"]
            )
            
            # Create initial shutdown state
            shutdown_info = context.user_data["shutdown_info"]
            state = await ShutdownStateRepository.get_or_create(session, address.id)
            await ShutdownStateRepository.update(
                session=session,
                state=state,
                shutdown_type=shutdown_info.shutdown_type,
                start_time=shutdown_info.start_time,
                end_time=shutdown_info.end_time,
                is_active=shutdown_info.is_active
            )
            
            logger.info(
                "Address saved",
                user_id=user.id,
                address_id=address.id,
                full_address=context.user_data["full_address"]
            )
        
        await query.edit_message_text(
            "✅ Адресу успішно додано!\n\n"
            "Ви будете отримувати сповіщення про зміни статусу відключень електроенергії.\n\n"
            "Використайте '📋 Мої адреси' щоб переглянути поточний статус."
        )
        
    except Exception as e:
        logger.error("Error saving address", error=str(e), exc_info=True)
        await query.edit_message_text(
            "❌ Помилка при збереженні адреси. Спробуйте пізніше."
        )
    
    return ConversationHandler.END


async def cancel_conversation(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Cancel the conversation."""
    await update.message.reply_text("❌ Додавання адреси скасовано.")
    return ConversationHandler.END


def get_add_address_handler() -> ConversationHandler:
    """Get add address conversation handler."""
    return ConversationHandler(
        entry_points=[
            MessageHandler(filters.Regex("^📍 Додати адресу$"), add_address_start)
        ],
        states={
            SELECT_REGION: [
                CallbackQueryHandler(select_region)
            ],
            INPUT_SETTLEMENT: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, input_settlement)
            ],
            SELECT_SETTLEMENT: [
                CallbackQueryHandler(select_settlement)
            ],
            INPUT_STREET: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, input_street)
            ],
            SELECT_STREET: [
                CallbackQueryHandler(select_street)
            ],
            SELECT_HOUSE: [
                CallbackQueryHandler(select_house),
                MessageHandler(filters.TEXT & ~filters.COMMAND, select_house)
            ],
            CONFIRM: [
                CallbackQueryHandler(confirm_address)
            ],
        },
        fallbacks=[
            MessageHandler(filters.Regex("^❌ Скасувати$"), cancel_conversation)
        ],
        conversation_timeout=600,  # 10 minutes timeout
    )
