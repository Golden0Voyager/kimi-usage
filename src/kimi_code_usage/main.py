import os
import asyncio
import argparse
import aiohttp
import json
import sys
from datetime import datetime, timedelta
from dotenv import load_dotenv
from rich.console import Console
from rich.panel import Panel
from rich.text import Text
from typing import Any, Mapping, Sequence, cast, Tuple, List

# --- i18n ---
LANG = os.getenv("LANG", "en")
IS_ZH = "zh" in LANG.lower()

L_EN = {
    "title": "Kimi Code Usage",
    "weekly_limit": "Weekly Usage",
    "limit_fallback": "Limit",
    "remaining": "remaining",
    "countdown": "Countdown",
    "reset": "Reset",
    "no_data": "No usage data found.",
    "error_key": "KIMI_API_KEY not found in environment or .env file.",
    "error_api": "API Error",
}

L_ZH = {
    "title": "Kimi Code 用量监控",
    "weekly_limit": "周用量限额",
    "limit_fallback": "限额",
    "remaining": "剩余",
    "countdown": "重置倒计时",
    "reset": "重置时间",
    "no_data": "未找到用量数据。",
    "error_key": "未在环境或 .env 文件中找到 KIMI_API_KEY。",
    "error_api": "API 错误",
}

L = L_ZH if IS_ZH else L_EN

class UsageRow:
    def __init__(self, label: str, used: int, limit: int, reset_at: str = None, countdown: str = None):
        self.label = label
        self.used = used
        self.limit = limit
        self.reset_at = reset_at
        self.countdown = countdown

def _to_int(v) -> int | None:
    try: return int(v)
    except (TypeError, ValueError): return None

def _get_reset_info(data: Mapping[str, Any]):
    reset_at = data.get("resetTime") or data.get("reset_at") or data.get("reset_time")
    if reset_at:
        try:
            if isinstance(reset_at, (int, float)):
                dt = datetime.fromtimestamp(reset_at)
            else:
                dt = datetime.fromisoformat(reset_at.replace("Z", "+00:00")).astimezone()
            
            now = datetime.now(dt.tzinfo) if dt.tzinfo else datetime.now()
            diff = dt - now
            if diff.total_seconds() <= 0: return dt.strftime("%m-%d %H:%M"), "0m"
            days = diff.days
            hours, rem = divmod(diff.seconds, 3600)
            minutes, _ = divmod(rem, 60)
            parts = []
            if days > 0: parts.append(f"{days}d")
            if hours > 0: parts.append(f"{hours}h")
            parts.append(f"{minutes}m")
            return dt.strftime("%m-%d %H:%M"), " ".join(parts)
        except Exception: pass
    
    reset_in = _to_int(data.get("reset_in"))
    if reset_in is not None:
        dt = datetime.now() + timedelta(seconds=reset_in)
        hours, rem = divmod(reset_in, 3600)
        minutes, _ = divmod(rem, 60)
        return dt.strftime("%m-%d %H:%M"), f"{hours}h {minutes}m"
    return None

def _limit_label(item, detail, window, idx) -> str:
    duration = _to_int(window.get("duration"))
    time_unit = str(window.get("time_unit") or "").upper()
    if duration and time_unit:
        if "HOUR" in time_unit: return f"{duration}h {L['limit_fallback']}"
        if "DAY" in time_unit: return f"{duration}d {L['limit_fallback']}"
    return f"{L['limit_fallback']} #{idx + 1}"

def _to_usage_row(data, *, default_label) -> UsageRow | None:
    limit = _to_int(data.get("limit") or data.get("limit_amount"))
    used = _to_int(data.get("used") or data.get("used_amount"))
    if used is None:
        remaining = _to_int(data.get("remaining"))
        if remaining is not None and limit is not None:
            used = limit - remaining
    if used is None and limit is None: return None
    reset_at, countdown = _get_reset_info(data) or (None, None)
    return UsageRow(
        label=str(data.get("name") or data.get("title") or data.get("model_name") or default_label),
        used=used or 0,
        limit=limit or 0,
        reset_at=reset_at,
        countdown=countdown,
    )

def _parse_usage_payload(payload):
    summary = None
    limits = []
    
    # Check if it's the direct list from /usage or the nested dict from /usages
    data_list = payload.get("data")
    if isinstance(data_list, Sequence):
        # Format: [{"model_name": "all", ...}, {"model_name": "...", ...}]
        for item in data_list:
            label = L["weekly_limit"] if item.get("model_name") == "all" else L["limit_fallback"]
            row = _to_usage_row(item, default_label=label)
            if row:
                if item.get("model_name") == "all": summary = row
                else: limits.append(row)
    else:
        # Original complex structure
        usage = payload.get("usage")
        if isinstance(usage, Mapping):
            summary = _to_usage_row(cast(Mapping, usage), default_label=L["weekly_limit"])
        raw_limits = payload.get("limits")
        if isinstance(raw_limits, Sequence):
            for idx, item in enumerate(raw_limits):
                if not isinstance(item, Mapping): continue
                detail = item.get("detail") if isinstance(item.get("detail"), Mapping) else item
                window = item.get("window") if isinstance(item.get("window"), Mapping) else {}
                row = _to_usage_row(detail, default_label=_limit_label(item, detail, window, idx))
                if row: limits.append(row)
                
    return summary, limits

def _get_visual_width(s: str) -> int:
    import unicodedata
    width = 0
    for char in s:
        if unicodedata.east_asian_width(char) in ("W", "F", "A"): width += 2
        else: width += 1
    return width

def _format_rows(rows: List[UsageRow]) -> Text:
    visual_widths = [_get_visual_width(r.label) for r in rows]
    max_visual_width = max(visual_widths) if visual_widths else 0
    max_visual_width = max(max_visual_width, 6)
    bar_width = 20
    result = Text()
    for i, row in enumerate(rows):
        used_ratio = row.used / row.limit if row.limit > 0 else 0
        remaining_percent = 100 - (used_ratio * 100)
        color = "red" if used_ratio > 0.9 else "yellow" if used_ratio > 0.7 else "green"
        filled = int(used_ratio * bar_width)
        if i > 0: result.append("\n\n")
        
        label_v_width = _get_visual_width(row.label)
        padding = " " * (max_visual_width - label_v_width)
        result.append(f"{row.label}{padding}  ", style="cyan")
        result.append("█" * filled, style=color)
        result.append("░" * (bar_width - filled))
        result.append(f"  {used_ratio * 100:.0f}%   {remaining_percent:.0f}% {L['remaining']}", style="bold")
        
        meta_parts = []
        if row.countdown: meta_parts.append(f"{L['countdown']}: {row.countdown}")
        if row.reset_at: meta_parts.append(f"{L['reset']}: {row.reset_at}")
        if meta_parts:
            result.append("\n")
            result.append("  ".join(meta_parts), style="dim cyan")
    return result

async def get_usage_data(api_key: str, base_url: str) -> Tuple[UsageRow | None, List[UsageRow]]:
    url = base_url.rstrip("/") + "/usages"
    async with aiohttp.ClientSession() as session:
        async with session.get(url, headers={"Authorization": f"Bearer {api_key}"}) as resp:
            if resp.status != 200:
                # Try fallback /usage if /usages fails
                fallback_url = base_url.rstrip("/") + "/usage"
                async with session.get(fallback_url, headers={"Authorization": f"Bearer {api_key}"}) as f_resp:
                    if f_resp.status != 200:
                        text = await f_resp.text()
                        raise Exception(f"{L['error_api']} {f_resp.status}: {text}")
                    payload = await f_resp.json()
            else:
                payload = await resp.json()
    
    return _parse_usage_payload(payload)

async def main():
    load_dotenv()
    parser = argparse.ArgumentParser(description="Kimi Code Usage CLI")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--plain", action="store_true")
    args = parser.parse_args()

    api_key = os.getenv("KIMI_API_KEY") or os.getenv("KIMI_CODING_API_KEY")
    base_url = os.getenv("KIMI_BASE_URL", "https://api.kimi.com/coding/v1")
    if not api_key:
        print(f"[Error] {L['error_key']}", file=sys.stderr)
        return

    try:
        summary, limits = await get_usage_data(api_key, base_url)
        rows = ([summary] if summary else []) + limits

        if args.json:
            print(json.dumps([{"label": r.label, "used": r.used, "limit": r.limit, "reset_at": r.reset_at} for r in rows], ensure_ascii=False))
        elif args.plain:
            for r in rows:
                print(f"{r.label}: {r.used}/{r.limit} ({r.used/r.limit*100:.0f}% used)")
        else:
            console = Console()
            if not rows:
                console.print(Panel(Text(L["no_data"], style="dim"), title=f"[bold]{L['title']}[/bold]"))
            else:
                console.print(Panel(_format_rows(rows), title=f"[bold]{L['title']}[/bold]", expand=False, padding=(1, 2, 0, 2)))
    except Exception as e:
        print(f"[Error] {e}", file=sys.stderr)

def run_cli():
    asyncio.run(main())

if __name__ == "__main__":
    run_cli()
