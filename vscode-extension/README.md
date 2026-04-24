# Kimi Usage

Show Kimi API usage quota in the VS Code status bar.

## Features

- Status bar indicator for remaining API quota percentage
- Color-coded warnings (yellow < 30%, red < 10%)
- Hover tooltip with detailed usage breakdown
- Command palette: `Kimi: Refresh Usage`, `Kimi: Show Details`
- Auto-refresh every 5 minutes (configurable)

## Configuration

- `kimiUsage.apiKey` — Kimi API key (or set `KIMI_API_KEY` env var)
- `kimiUsage.baseUrl` — API base URL (default: `https://api.kimi.com/coding/v1`)
- `kimiUsage.refreshIntervalMinutes` — Auto-refresh interval
- `kimiUsage.warnPercent` — Warning threshold
- `kimiUsage.criticalPercent` — Critical threshold
