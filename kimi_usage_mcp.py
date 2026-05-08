#!/usr/bin/env python3
"""Kimi Usage MCP Server — exposes get_kimi_usage() to Claude Code / Cursor / Windsurf."""

from __future__ import annotations

import importlib
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP
from rich.console import Console

load_dotenv(dotenv_path=Path(__file__).parent / ".env")

mcp = FastMCP("kimi-code-usage")

# Initial import so the module is in sys.modules
import kimi_usage


def _resolve_config():
    # Support both naming conventions for better compatibility
    api_key = os.getenv("KIMI_API_KEY") or os.getenv("KIMI_CODING_API_KEY")
    base_url = os.getenv("KIMI_BASE_URL", kimi_usage.DEFAULT_BASE_URL)
    if not api_key:
        raise RuntimeError(
            "KIMI_API_KEY not set. Add it to .env or export it before starting the MCP server."
        )
    return base_url, api_key


@mcp.tool()
async def get_kimi_usage() -> str:
    """Fetch current Kimi API usage and quota information with curated aesthetic precision."""
    # Reload module on every call so code changes take effect without restarting
    importlib.reload(kimi_usage)

    base_url, api_key = _resolve_config()

    try:
        payload = await kimi_usage.fetch_usage(base_url, api_key)
    except Exception as e:
        return f"❌ Failed to fetch usage: {e}"

    summary, limits = kimi_usage._parse_usage_payload(payload)
    panel = kimi_usage._build_usage_panel(summary, limits)

    # Render with Rich for consistent borders, colors and alignment.
    # force_terminal=True ensures ANSI color codes are emitted even over stdio.
    console = Console(force_terminal=True, width=70)
    with console.capture() as capture:
        console.print(panel)
    return capture.get()


if __name__ == "__main__":
    mcp.run(transport="stdio")
