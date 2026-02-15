"""
DTEK website scraper using Playwright for headless browser automation.
"""
import asyncio
import re
from datetime import datetime
from typing import List, Optional

from playwright.async_api import async_playwright, Browser, BrowserContext, Page, TimeoutError as PlaywrightTimeoutError
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

from bot.config import settings
from bot.scraper.models import ShutdownInfo, AddressOption, AddressResult
from bot.scraper.regions import get_region_url
from bot.utils.logger import get_logger

logger = get_logger(__name__)


class DTEKScraper:
    """Scraper for DTEK websites using Playwright."""
    
    def __init__(self):
        self.browser: Optional[Browser] = None
        self.playwright = None
    
    async def __aenter__(self):
        """Async context manager entry."""
        await self.start()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.close()
    
    async def start(self) -> None:
        """Start Playwright browser."""
        logger.info("Starting Playwright browser")
        try:
            self.playwright = await async_playwright().start()
            self.browser = await self.playwright.chromium.launch(
                headless=True,
                args=['--no-sandbox', '--disable-setuid-sandbox']
            )
            logger.info("Playwright browser started")
        except Exception as e:
            logger.error("Failed to start browser", error=str(e), exc_info=True)
            raise
    
    async def close(self) -> None:
        """Close Playwright browser."""
        if self.browser:
            logger.info("Closing Playwright browser")
            await self.browser.close()
            await self.playwright.stop()
            logger.info("Playwright browser closed")
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=4),
        retry=retry_if_exception_type((PlaywrightTimeoutError, Exception)),
        reraise=True
    )
    async def get_autocomplete_options(
        self,
        region: str,
        field_type: str,
        search_text: str,
        settlement: Optional[str] = None
    ) -> List[AddressOption]:
        """
        Get autocomplete options from DTEK website.
        
        Args:
            region: Region name (київ, київщина, etc.)
            field_type: Type of field (settlement, street, house)
            search_text: Text to search for
            settlement: Settlement name (required for street search in regions other than Kyiv)
        
        Returns:
            List of AddressOption objects
        """
        logger.info(
            "Getting autocomplete options",
            region=region,
            field_type=field_type,
            search_text=search_text
        )
        
        context = await self.browser.new_context()
        page = await context.new_page()
        
        try:
            url = get_region_url(region)
            await page.goto(url, timeout=settings.playwright_navigation_timeout)
            await page.wait_for_load_state("networkidle")
            
            # For regions other than Kyiv, we need to fill settlement first
            if region.lower() != "київ" and settlement and field_type in ["street", "house"]:
                await self._fill_settlement(page, settlement)
            
            # Get the appropriate input field
            input_selector = self._get_input_selector(field_type)
            await page.wait_for_selector(input_selector, timeout=settings.playwright_element_timeout)
            
            # Type the search text
            await page.fill(input_selector, search_text)
            await asyncio.sleep(0.5)  # Wait for autocomplete to appear
            
            # Wait for dropdown to appear
            dropdown_selector = self._get_dropdown_selector(field_type)
            try:
                await page.wait_for_selector(dropdown_selector, timeout=5000, state="visible")
            except PlaywrightTimeoutError:
                logger.warning("Dropdown did not appear", field_type=field_type)
                return []
            
            # Get all options from dropdown
            options = await page.query_selector_all(f"{dropdown_selector} li, {dropdown_selector} div[role='option']")
            
            results = []
            for option in options[:20]:  # Limit to 20 options
                text = await option.inner_text()
                text = text.strip()
                if text:
                    results.append(AddressOption(display_text=text, value=text))
            
            logger.info("Got autocomplete options", count=len(results), field_type=field_type)
            return results
            
        except Exception as e:
            logger.error(
                "Failed to get autocomplete options",
                error=str(e),
                region=region,
                field_type=field_type,
                exc_info=True
            )
            raise
        finally:
            await context.close()
    
    async def _fill_settlement(self, page: Page, settlement: str) -> None:
        """Fill settlement field (for non-Kyiv regions)."""
        settlement_input = 'input[name="settlement"], input[placeholder*="населений"]'
        await page.fill(settlement_input, settlement)
        await asyncio.sleep(0.5)
        
        # Click on the first option
        dropdown = 'ul.autocomplete, div[role="listbox"]'
        try:
            await page.wait_for_selector(dropdown, timeout=5000, state="visible")
            first_option = f"{dropdown} li:first-child, {dropdown} div[role='option']:first-child"
            await page.click(first_option)
            await asyncio.sleep(0.3)
        except PlaywrightTimeoutError:
            logger.warning("Could not select settlement from dropdown")
    
    def _get_input_selector(self, field_type: str) -> str:
        """Get CSS selector for input field based on field type."""
        selectors = {
            "settlement": 'input[name="settlement"], input[placeholder*="населений"]',
            "street": 'input[name="street"], input[placeholder*="вулиц"]',
            "house": 'input[name="house"], input[placeholder*="будинок"], input[placeholder*="номер"]',
        }
        return selectors.get(field_type, 'input[type="text"]')
    
    def _get_dropdown_selector(self, field_type: str) -> str:
        """Get CSS selector for dropdown based on field type."""
        return 'ul.autocomplete, div[role="listbox"], .autocomplete-dropdown'
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=4),
        retry=retry_if_exception_type((PlaywrightTimeoutError, Exception)),
        reraise=True
    )
    async def get_shutdown_info(
        self,
        region: str,
        settlement: Optional[str],
        street: str,
        house: str
    ) -> ShutdownInfo:
        """
        Get shutdown information for a specific address.
        
        Args:
            region: Region name
            settlement: Settlement name (None for Kyiv)
            street: Street name
            house: House number
        
        Returns:
            ShutdownInfo object
        """
        logger.info(
            "Getting shutdown info",
            region=region,
            settlement=settlement,
            street=street,
            house=house
        )
        
        context = await self.browser.new_context()
        page = await context.new_page()
        
        try:
            url = get_region_url(region)
            await page.goto(url, timeout=settings.playwright_navigation_timeout)
            await page.wait_for_load_state("networkidle")
            
            # Fill the form
            if region.lower() != "київ" and settlement:
                await self._fill_field_with_autocomplete(page, "settlement", settlement)
            
            await self._fill_field_with_autocomplete(page, "street", street)
            await self._fill_field_with_autocomplete(page, "house", house)
            
            # Submit the form (usually there's a search button)
            submit_button = 'button[type="submit"], button:has-text("Перевірити"), button:has-text("Знайти")'
            try:
                await page.click(submit_button, timeout=5000)
                await page.wait_for_load_state("networkidle")
                await asyncio.sleep(1)
            except PlaywrightTimeoutError:
                logger.warning("Submit button not found, trying to read results anyway")
            
            # Parse the results
            shutdown_info = await self._parse_shutdown_info(page)
            
            logger.info(
                "Got shutdown info",
                is_active=shutdown_info.is_active,
                shutdown_type=shutdown_info.shutdown_type
            )
            
            return shutdown_info
            
        except Exception as e:
            logger.error(
                "Failed to get shutdown info",
                error=str(e),
                region=region,
                exc_info=True
            )
            raise
        finally:
            await context.close()
    
    async def _fill_field_with_autocomplete(
        self,
        page: Page,
        field_type: str,
        value: str
    ) -> None:
        """Fill a field and select from autocomplete."""
        input_selector = self._get_input_selector(field_type)
        await page.fill(input_selector, value)
        await asyncio.sleep(0.5)
        
        # Try to click on exact match in dropdown
        dropdown = self._get_dropdown_selector(field_type)
        try:
            await page.wait_for_selector(dropdown, timeout=5000, state="visible")
            # Look for exact match or first option
            options = await page.query_selector_all(f"{dropdown} li, {dropdown} div[role='option']")
            
            for option in options:
                text = await option.inner_text()
                if value.lower() in text.lower():
                    await option.click()
                    await asyncio.sleep(0.3)
                    return
            
            # If no match, click first option
            if options:
                await options[0].click()
                await asyncio.sleep(0.3)
                
        except PlaywrightTimeoutError:
            logger.warning(f"No dropdown appeared for {field_type}")
    
    async def _parse_shutdown_info(self, page: Page) -> ShutdownInfo:
        """Parse shutdown information from the results page."""
        try:
            # Look for common result containers
            result_selectors = [
                '.result-container',
                '.shutdown-info',
                '#result',
                '.outage-info',
                'div:has-text("відключення")',
            ]
            
            result_text = ""
            for selector in result_selectors:
                try:
                    element = await page.wait_for_selector(selector, timeout=3000)
                    result_text = await element.inner_text()
                    if result_text:
                        break
                except PlaywrightTimeoutError:
                    continue
            
            # If no specific container found, get body text
            if not result_text:
                result_text = await page.inner_text('body')
            
            result_text = result_text.lower()
            
            # Check for shutdown type
            shutdown_type = None
            is_active = False
            
            if "аварійн" in result_text:
                shutdown_type = "аварійне"
                is_active = True
            elif "планов" in result_text:
                shutdown_type = "планове"
                is_active = True
            elif "немає відключення" in result_text or "відключень не заплановано" in result_text:
                shutdown_type = None
                is_active = False
            
            # Try to extract times
            start_time = self._extract_datetime(result_text, "початок")
            end_time = self._extract_datetime(result_text, "завершення")
            
            return ShutdownInfo(
                shutdown_type=shutdown_type,
                start_time=start_time,
                end_time=end_time,
                is_active=is_active,
                raw_text=result_text[:500] if result_text else None
            )
            
        except Exception as e:
            logger.error("Failed to parse shutdown info", error=str(e), exc_info=True)
            # Return default "no shutdown" info
            return ShutdownInfo(
                shutdown_type=None,
                start_time=None,
                end_time=None,
                is_active=False,
                raw_text=None
            )
    
    def _extract_datetime(self, text: str, keyword: str) -> Optional[datetime]:
        """Extract datetime from text based on keyword."""
        # Look for patterns like "15.02 18:00" or "15.02.2024 18:00"
        patterns = [
            r'(\d{1,2}\.\d{1,2}\.\d{4})\s+(\d{1,2}:\d{2})',
            r'(\d{1,2}\.\d{1,2})\s+(\d{1,2}:\d{2})',
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, text)
            if matches:
                for match in matches:
                    try:
                        if len(match[0].split('.')) == 3:
                            # Full date
                            date_str = f"{match[0]} {match[1]}"
                            return datetime.strptime(date_str, "%d.%m.%Y %H:%M")
                        else:
                            # Date without year
                            date_str = f"{match[0]}.{datetime.now().year} {match[1]}"
                            return datetime.strptime(date_str, "%d.%m.%Y %H:%M")
                    except ValueError:
                        continue
        
        return None


async def create_scraper() -> DTEKScraper:
    """Create and initialize a new scraper instance."""
    scraper = DTEKScraper()
    await scraper.start()
    return scraper
