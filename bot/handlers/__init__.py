"""
Handlers package.
"""
from bot.handlers.start import get_start_handler
from bot.handlers.add_address import get_add_address_handler
from bot.handlers.my_addresses import get_my_addresses_handler
from bot.handlers.delete_address import get_delete_address_handler

__all__ = [
    "get_start_handler",
    "get_add_address_handler",
    "get_my_addresses_handler",
    "get_delete_address_handler",
]
