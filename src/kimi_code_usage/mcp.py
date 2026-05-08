import os
from fastmcp import FastMCP
from .main import get_usage_data, _format_rows, L

# Initialize FastMCP for Kimi Code Usage
mcp = FastMCP("Kimi Code Usage")


@mcp.tool()
async def get_kimi_usage() -> str:
    """
    Get the current Kimi Coding Plan API usage and quota limits.
    Returns a formatted summary including used/remaining quota and reset time.
    获取当前 Kimi Coding Plan API 的使用量和配额限制，包括已用量、剩余量和重置时间。
    """
    api_key = os.getenv("KIMI_API_KEY") or os.getenv("KIMI_CODING_API_KEY")
    base_url = os.getenv("KIMI_BASE_URL", "https://api.kimi.com/coding/v1")

    if not api_key:
        return f"Error: {L['error_key']}"

    try:
        summary, limits = await get_usage_data(api_key, base_url)
        rows = ([summary] if summary else []) + limits

        if not rows:
            return L["no_data"]

        # Return clean plain text — no ANSI codes, friendly for LLMs
        lines = []
        for row in rows:
            used_ratio = row.used / row.limit if row.limit > 0 else 0
            remaining = row.limit - row.used
            remaining_pct = 100 - used_ratio * 100
            line = f"{row.label}: {row.used}/{row.limit} used ({remaining_pct:.0f}% remaining)"
            if row.countdown and row.reset_at:
                line += f" | Reset in {row.countdown} (at {row.reset_at})"
            lines.append(line)

        return "\n".join(lines)

    except Exception as e:
        return f"Error fetching Kimi usage: {str(e)}"


def run_mcp():
    mcp.run()


if __name__ == "__main__":
    run_mcp()
