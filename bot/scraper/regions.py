"""
Region mapping for DTEK websites.
"""
from typing import Dict

# Region names mapping
REGION_NAMES: Dict[str, str] = {
    "київ": "Київ",
    "київщина": "Київщина",
    "дніпропетровщина": "Дніпропетровщина",
    "одещина": "Одещина",
}

# Region URLs mapping
REGION_URLS: Dict[str, str] = {
    "київ": "https://www.dtek-kem.com.ua/ua/shutdowns",
    "київщина": "https://www.dtek-krem.com.ua/ua/shutdowns",
    "дніпропетровщина": "https://www.dtek-dnem.com.ua/ua/shutdowns",
    "одещина": "https://www.dtek-oem.com.ua/ua/shutdowns",
}

# Display names for regions
REGION_DISPLAY_NAMES: Dict[str, str] = {
    "київ": "🏙️ Київ",
    "київщина": "🌾 Київщина",
    "дніпропетровщина": "🏭 Дніпропетровщина",
    "одещина": "🌊 Одещина",
}


def get_region_url(region: str) -> str:
    """Get URL for region."""
    return REGION_URLS.get(region.lower(), "")


def get_region_display_name(region: str) -> str:
    """Get display name for region."""
    return REGION_DISPLAY_NAMES.get(region.lower(), region)
