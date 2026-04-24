# Kimi Usage

查询 Kimi (Moonshot AI) Coding Plan API 用量配额的多端工具集：CLI + MCP Server + VSCode Extension。

## 组件

- **`kimi_usage.py`** — 独立 CLI 工具，Rich 进度条面板显示用量
- **`kimi_usage_mcp.py`** — MCP Server，供 Hermes / Claude Code / Cursor 调用
- **`vscode-extension/`** — VSCode 插件，status bar 实时显示余量百分比

## 快速开始

### CLI

```bash
pip install -r requirements.txt
cp .env.example .env
# 编辑 .env 填入 KIMI_API_KEY
python kimi_usage.py
```

### MCP Server

在 Hermes / Claude Code / Cursor 的 MCP 配置中添加：

```json
{
  "mcpServers": {
    "kimi_usage": {
      "command": "python3",
      "args": ["/path/to/kimi_usage_mcp.py"],
      "env": {
        "PYTHONPATH": "/path/to/kimi_usage",
        "PWD": "/path/to/kimi_usage"
      }
    }
  }
}
```

### VSCode 插件

```bash
cd vscode-extension
npm install && npm run compile
vsce package
code --install-extension kimi-usage-0.1.0.vsix
```

安装后在 VSCode Settings 搜索 `kimiUsage` 填入 API Key，或设置 `KIMI_API_KEY` 环境变量。

## 配置

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `KIMI_API_KEY` | Kimi Coding Plan API Key | **必填** |
| `KIMI_BASE_URL` | API Base URL | `https://api.kimi.com/coding/v1` |

## License

MIT