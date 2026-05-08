import os
from fastmcp import FastMCP
from .main import get_usage_data, _format_rows, L
from rich.console import Console
from io import StringIO

# Initialize FastMCP for Kimi Code Usage
mcp = FastMCP(
    "Kimi Code Usage",
    dependencies=["aiohttp", "rich", "python-dotenv"]
)

@mcp.tool()
async def get_kimi_usage() -> str:
    """
    Get the current Kimi Coding Plan API usage and quota limits.
    获取当前 Kimi Coding Plan API 的使用量和配额限制。
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

        content = _format_rows(rows)
        
        # Capture rich output to string
        console = Console(file=StringIO(), force_terminal=True, width=60)
        from rich.panel import Panel
        panel = Panel(content, title=f"[bold]{L['title']}[/bold]", expand=False, padding=(1, 2, 0, 2))
        console.print(panel)
        return console.file.getvalue()
    except Exception as e:
        return f"Error fetching usage: {str(e)}"

def run_mcp():
    mcp.run()

if __name__ == "__main__":
    run_mcp()
