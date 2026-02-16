"""
Scraper package for DTEK websites.
"""
from bot.scraper.dtek_scraper import DTEKScraper, create_scraper
from bot.scraper.models import ShutdownInfo, AddressOption, AddressResult
from bot.scraper.regions import (
    REGION_NAMES,
    REGION_URLS,
    REGION_DISPLAY_NAMES,
    get_region_url,
    get_region_display_name,
)

__all__ = [
    "DTEKScraper",
    "create_scraper",
    "ShutdownInfo",
    "AddressOption",
    "AddressResult",
    "REGION_NAMES",
    "REGION_URLS",
    "REGION_DISPLAY_NAMES",
    "get_region_url",
    "get_region_display_name",
]
