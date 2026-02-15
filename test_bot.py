#!/usr/bin/env python3
"""
Simple test script to verify bot components.
"""
import asyncio
import os
import sys

# Set test environment variables before importing bot modules
os.environ.setdefault("BOT_TOKEN", "test-token-for-testing")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/test_db")
os.environ.setdefault("LOG_LEVEL", "INFO")


async def test_imports():
    """Test that all imports work."""
    print("Testing imports...")
    
    try:
        from bot.config import settings
        print("✅ Config imported")
        
        from bot.utils.logger import configure_logging, get_logger
        print("✅ Logger imported")
        
        from bot.db.models import User, Address, ShutdownState
        print("✅ Database models imported")
        
        from bot.db.repository import UserRepository, AddressRepository, ShutdownStateRepository
        print("✅ Database repositories imported")
        
        from bot.scraper import DTEKScraper, REGION_URLS
        print("✅ Scraper imported")
        print(f"   Regions available: {list(REGION_URLS.keys())}")
        
        from bot.handlers import (
            get_start_handler,
            get_add_address_handler,
            get_my_addresses_handler,
            get_delete_address_handler,
        )
        print("✅ Handlers imported")
        
        from bot.scheduler import MonitoringService
        print("✅ Scheduler imported")
        
        print("\n✨ All imports successful!")
        return True
        
    except Exception as e:
        print(f"\n❌ Import failed: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_config():
    """Test configuration."""
    print("\n" + "="*50)
    print("Testing configuration...")
    
    try:
        from bot.config import settings
        
        print(f"  Database URL: {settings.database_url[:30]}...")
        print(f"  Log level: {settings.log_level}")
        print(f"  Check interval: {settings.check_interval_minutes} minutes")
        print(f"  Playwright timeout: {settings.playwright_timeout}ms")
        
        print("✅ Configuration loaded")
        return True
        
    except Exception as e:
        print(f"❌ Configuration test failed: {e}")
        return False


async def test_scraper_regions():
    """Test scraper region mapping."""
    print("\n" + "="*50)
    print("Testing scraper regions...")
    
    try:
        from bot.scraper import REGION_URLS, REGION_DISPLAY_NAMES, get_region_url, get_region_display_name
        
        for region in REGION_URLS.keys():
            url = get_region_url(region)
            display = get_region_display_name(region)
            print(f"  {display}: {url}")
        
        print("✅ Scraper regions configured")
        return True
        
    except Exception as e:
        print(f"❌ Scraper regions test failed: {e}")
        return False


async def main():
    """Run all tests."""
    print("="*50)
    print("ALTANKA TELEGRAM BOT - COMPONENT TESTS")
    print("="*50)
    
    results = []
    
    results.append(await test_imports())
    results.append(await test_config())
    results.append(await test_scraper_regions())
    
    print("\n" + "="*50)
    print("RESULTS")
    print("="*50)
    
    passed = sum(results)
    total = len(results)
    
    print(f"Passed: {passed}/{total}")
    
    if all(results):
        print("\n✨ All tests passed! Bot components are ready.")
        return 0
    else:
        print("\n❌ Some tests failed. Please check the errors above.")
        return 1


if __name__ == "__main__":
    try:
        exit_code = asyncio.run(main())
        sys.exit(exit_code)
    except KeyboardInterrupt:
        print("\n\nTest interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
