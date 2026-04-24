#!/usr/bin/env python3
"""Standalone Kimi API usage reporter.
Extracted from kimi-cli src/kimi_cli/ui/shell/usage.py
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast

import aiohttp
from dotenv import load_dotenv
from rich.console import Console
from rich.panel import Panel
from rich.text import Text

# Load .env from the same directory as this script
load_dotenv(dotenv_path=Path(__file__).parent / ".env")

DEFAULT_BASE_URL = "https://api.kimi.com/coding/v1"


@dataclass(slots=True, frozen=True)
class UsageRow:
    label: str
    used: int
    limit: int
    reset_at: str | None = None
    countdown: str | None = None


def format_duration(seconds: int) -> str:
    from datetime import timedelta
    delta = timedelta(seconds=seconds)
    parts: list[str] = []
    days = delta.days
    if days:
        parts.append(f"{days}d")
    hours, remainder = divmod(delta.seconds, 3600)
    minutes, secs = divmod(remainder, 60)
    if hours:
        parts.append(f"{hours}h")
    if minutes:
        parts.append(f"{minutes}m")
    if secs and not parts:
        parts.append(f"{secs}s")
    return " ".join(parts) or "0s"


def _to_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _format_reset_time(val: str) -> tuple[str, str] | None:
    try:
        if "." in val and val.endswith("Z"):
            base, frac = val[:-1].split(".")
            frac = frac[:6]
            val = f"{base}.{frac}Z"
        dt_utc = datetime.fromisoformat(val.replace("Z", "+00:00"))
        from datetime import timezone, timedelta
        dt_shanghai = dt_utc.astimezone(timezone(timedelta(hours=8)))
        delta = dt_utc - datetime.now(UTC)
        if delta.total_seconds() <= 0:
            return None
        abs_time = dt_shanghai.strftime("%m-%d %H:%M")
        rel = format_duration(int(delta.total_seconds()))
        return (abs_time, rel)
    except (ValueError, TypeError):
        return None


def _get_reset_info(data: Mapping[str, Any]) -> tuple[str, str] | None:
    for key in ("reset_at", "resetAt", "reset_time", "resetTime"):
        if val := data.get(key):
            return _format_reset_time(str(val))
    return None


def _limit_label(item, detail, window, idx) -> str:
    for key in ("name", "title", "scope"):
        if val := (item.get(key) or detail.get(key)):
            return str(val)
    duration = _to_int(window.get("duration") or item.get("duration") or detail.get("duration"))
    time_unit = window.get("timeUnit") or item.get("timeUnit") or detail.get("timeUnit") or ""
    if duration:
        if "MINUTE" in time_unit:
            return f"{duration // 60}h limit" if duration >= 60 and duration % 60 == 0 else f"{duration}m limit"
        if "HOUR" in time_unit:
            return f"{duration}h limit"
        if "DAY" in time_unit:
            return f"{duration}d limit"
        return f"{duration}s limit"
    return f"Limit #{idx + 1}"


def _to_usage_row(data, *, default_label) -> UsageRow | None:
    limit = _to_int(data.get("limit"))
    used = _to_int(data.get("used"))
    if used is None:
        remaining = _to_int(data.get("remaining"))
        if remaining is not None and limit is not None:
            used = limit - remaining
    if used is None and limit is None:
        return None
    reset_at, countdown = _get_reset_info(data) or (None, None)
    return UsageRow(
        label=str(data.get("name") or data.get("title") or default_label),
        used=used or 0,
        limit=limit or 0,
        reset_at=reset_at,
        countdown=countdown,
    )


def _parse_usage_payload(payload):
    summary = None
    limits = []
    usage = payload.get("usage")
    if isinstance(usage, Mapping):
        summary = _to_usage_row(cast(Mapping, usage), default_label="Weekly limit")
    raw_limits = payload.get("limits")
    if isinstance(raw_limits, Sequence):
        for idx, item in enumerate(raw_limits):
            if not isinstance(item, Mapping):
                continue
            detail = item.get("detail") if isinstance(item.get("detail"), Mapping) else item
            window = item.get("window") if isinstance(item.get("window"), Mapping) else {}
            row = _to_usage_row(detail, default_label=_limit_label(item, detail, window, idx))
            if row:
                limits.append(row)
    return summary, limits


def _ratio_color(used_ratio: float) -> str:
    if used_ratio >= 0.9:
        return "red"
    if used_ratio >= 0.7:
        return "yellow"
    return "green"


def _format_rows(rows: list[UsageRow]) -> Text:
    label_width = max(len(r.label) for r in rows)
    label_width = max(label_width, 6)
    bar_width = 20

    result = Text()
    for i, row in enumerate(rows):
        used_ratio = row.used / row.limit if row.limit > 0 else 0
        remaining = row.limit - row.used
        color = _ratio_color(used_ratio)
        filled = int(used_ratio * bar_width)

        if i > 0:
            result.append("\n\n")

        # Line 1: label + bar + stats
        result.append(f"{row.label:<{label_width}}  ", style="cyan")
        result.append("█" * filled, style=color)
        result.append("░" * (bar_width - filled))
        result.append(f"  {used_ratio * 100:.0f}%   {remaining}% remaining", style="bold")

        # Line 2: countdown + reset, aligned with label (no indent)
        meta_parts: list[str] = []
        if row.countdown:
            meta_parts.append(f"Countdown: {row.countdown}")
        if row.reset_at:
            meta_parts.append(f"Reset: {row.reset_at}")
        if meta_parts:
            result.append("\n")
            result.append("  ".join(meta_parts), style="dim cyan")

    return result


def _build_usage_panel(summary, limits) -> Panel:
    rows = ([summary] if summary else []) + limits
    if not rows:
        return Panel(Text("No usage data", style="grey50"), border_style="wheat4", padding=(0, 2))
    return Panel(
        _format_rows(rows),
        title=Text("Kimi Code Usage", style="bold cyan"),
        title_align="left",
        border_style="wheat4",
        padding=(1, 2, 0, 2),
        expand=False,
    )


def output_plain(summary, limits) -> None:
    for r in ([summary] if summary else []) + limits:
        used_ratio = r.used / r.limit if r.limit > 0 else 0
        print(f"{r.label}: {r.used}/{r.limit} ({used_ratio*100:.0f}% used, {r.limit - r.used} remaining)")
        meta_parts = []
        if r.countdown:
            meta_parts.append(f"Countdown: {r.countdown}")
        if r.reset_at:
            meta_parts.append(f"Reset: {r.reset_at}")
        if meta_parts:
            print(f"  {'  '.join(meta_parts)}")


def output_json(summary, limits) -> None:
    out = []
    for r in ([summary] if summary else []) + limits:
        used_ratio = r.used / r.limit if r.limit > 0 else 0
        out.append({
            "label": r.label,
            "used": r.used,
            "limit": r.limit,
            "remaining": r.limit - r.used,
            "percent_used": round(used_ratio * 100, 1),
            "reset_at": r.reset_at,
            "countdown": r.countdown,
        })
    print(json.dumps(out, indent=2, ensure_ascii=False))


async def fetch_usage(base_url: str, api_key: str) -> Mapping[str, Any]:
    url = base_url.rstrip("/") + "/usages"
    async with aiohttp.ClientSession() as session:
        async with session.get(
            url,
            headers={"Authorization": f"Bearer {api_key}"},
            raise_for_status=True,
        ) as resp:
            return await resp.json()


async def async_main() -> None:
    parser = argparse.ArgumentParser(description="Kimi API Usage Reporter")
    parser.add_argument("--api-key", default=os.getenv("KIMI_API_KEY"), help="API key (or KIMI_API_KEY env)")
    parser.add_argument("--base-url", default=os.getenv("KIMI_BASE_URL", DEFAULT_BASE_URL), help=f"Base URL (default: {DEFAULT_BASE_URL})")
    parser.add_argument("--json", action="store_true", help="JSON output")
    parser.add_argument("--plain", action="store_true", help="Plain text output")
    args = parser.parse_args()

    if not args.api_key:
        print("Error: API key required. Set KIMI_API_KEY in .env or use --api-key.", file=sys.stderr)
        sys.exit(1)

    try:
        payload = await fetch_usage(args.base_url, args.api_key)
    except aiohttp.ClientResponseError as e:
        msg = {401: "Authorization failed.", 404: "Usage endpoint not available."}.get(e.status, "Failed to fetch usage.")
        print(f"Error: {msg}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    summary, limits = _parse_usage_payload(payload)
    if args.json:
        output_json(summary, limits)
    elif args.plain:
        output_plain(summary, limits)
    else:
        Console().print(_build_usage_panel(summary, limits))


def main() -> None:
    asyncio.run(async_main())


if __name__ == "__main__":
    main()
