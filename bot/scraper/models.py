"""
Data models for scraper results.
"""
from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class ShutdownInfo:
    """Information about power shutdown."""
    shutdown_type: Optional[str]  # аварійне, планове, or None
    start_time: Optional[datetime]
    end_time: Optional[datetime]
    is_active: bool
    raw_text: Optional[str] = None


@dataclass
class AddressOption:
    """Address option from autocomplete."""
    display_text: str  # Text shown to user
    value: str  # Value to select in the form


@dataclass
class AddressResult:
    """Result of address parsing."""
    full_address: str
    shutdown_info: ShutdownInfo
    region: str
    settlement: Optional[str]
    street: str
    house: str
