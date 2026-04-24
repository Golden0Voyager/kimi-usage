# Kimi Usage

查询 Kimi (Moonshot AI) Coding Plan API 用量配额的多端工具集：CLI + MCP Server + VSCode Extension。

## 功能

- **CLI** — 终端运行，Rich 彩色进度条面板显示当前用量、剩余百分比、重置倒计时
- **MCP Server** — 供 Hermes / Claude Code / Cursor 等 AI Agent 调用，一键查看配额
- **VSCode Extension** — 状态栏实时显示剩余百分比，超限变色预警，hover 查看详情

---

## 前提条件

你需要一个 **Kimi Coding Plan** 的 API Key。在 Kimi 客户端或网页版中进入 Coding 模式，前往账户/设置页面创建或复制已创建的 API Key，然后粘贴到 `.env` 或环境变量中。

---

## 全局配置

所有组件共用同一个环境变量：

```bash
export KIMI_CODING_API_KEY="你的_API_Key"
```

或者创建 `.env` 文件：

```bash
cp .env.example .env
# 编辑 .env 填入 KIMI_CODING_API_KEY
```

可选：修改 API Base URL（通常不需要）

```bash
export KIMI_BASE_URL="https://api.kimi.com/coding/v1"
```

---

## 1. CLI 使用

### 安装依赖

```bash
git clone https://github.com/Golden0Voyager/kimi-usage.git
cd kimi-usage
pip install -r requirements.txt
```

### 运行

```bash
# 需要 KIMI_CODING_API_KEY 环境变量已设置
python kimi_usage.py
```

输出示例：

```
╭─ Kimi Code Usage ──────────────────────────────────╮
│                                                     │
│  Weekly limit   ████████░░░░░░░░░░░░  48%  52% remaining
│  Countdown: 4d 3h 36m  Reset: 04-28 15:57          │
│                                                     │
│  5h limit       ░░░░░░░░░░░░░░░░░░░░  0%   100% remaining
│  Countdown: 1h 36m  Reset: 04-24 13:57              │
╰─────────────────────────────────────────────────────╯
```

### 其他输出格式

```bash
python kimi_usage.py --plain   # 纯文本
python kimi_usage.py --json    # JSON
```

---

## 2. MCP Server 配置

供支持 MCP（Model Context Protocol）的 AI Agent 调用，如 **Hermes、Claude Code、Cursor**。

### Hermes

在 `~/.hermes/config.yaml` 的 `mcp_servers:` 下添加：

```yaml
  kimi_usage:
    command: python3
    args:
      - /absolute/path/to/kimi_usage_mcp.py
    env:
      KIMI_CODING_API_KEY: "你的_API_Key"
      PYTHONPATH: /absolute/path/to/kimi_usage
      PWD: /absolute/path/to/kimi_usage
```

重启 Hermes 后，输入 **"kimi 用量"** 即可调用。

### Claude Code

在 `~/.claude/settings.json` 中添加 MCP server：

```json
{
  "mcpServers": {
    "kimi_usage": {
      "command": "python3",
      "args": ["/absolute/path/to/kimi_usage_mcp.py"],
      "env": {
        "KIMI_CODING_API_KEY": "你的_API_Key",
        "PYTHONPATH": "/absolute/path/to/kimi_usage",
        "PWD": "/absolute/path/to/kimi_usage"
      }
    }
  }
}
```

### Cursor

打开 Cursor Settings → MCP，添加：

```json
{
  "mcpServers": {
    "kimi_usage": {
      "command": "python3",
      "args": ["/absolute/path/to/kimi_usage_mcp.py"],
      "env": {
        "KIMI_CODING_API_KEY": "你的_API_Key",
        "PYTHONPATH": "/absolute/path/to/kimi_usage",
        "PWD": "/absolute/path/to/kimi_usage"
      }
    }
  }
}
```

---

## 3. VSCode 插件安装

### 方式一：从 Release 下载（推荐）

1. 打开 [Releases 页面](https://github.com/Golden0Voyager/kimi-usage/releases)
2. 下载最新的 `kimi-usage-x.x.x.vsix` 文件
3. VSCode 中按 `Cmd+Shift+P` → **Extensions: Install from VSIX...**
4. 选择下载的 `.vsix` 文件
5. `Cmd+Shift+P` → **Developer: Reload Window**

### 方式二：从源码编译

```bash
cd kimi-usage/vscode-extension
npm install
npm run compile
vsce package          # 需要 npm install -g @vscode/vsce
code --install-extension kimi-usage-0.1.0.vsix
```

### 配置

VSCode Settings 中搜索 `kimiUsage`，配置以下选项：

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `kimiUsage.apiKey` | Kimi API Key（或留空读取 `KIMI_CODING_API_KEY` 环境变量） | `""` |
| `kimiUsage.baseUrl` | API Base URL | `https://api.kimi.com/coding/v1` |
| `kimiUsage.refreshIntervalMinutes` | 自动刷新间隔（分钟） | `5` |
| `kimiUsage.warnPercent` | 黄色警告阈值（剩余百分比） | `30` |
| `kimiUsage.criticalPercent` | 红色告警阈值（剩余百分比） | `10` |

### 使用

- **状态栏** — 右下角显示 `$(chip) Kimi W:52% 5H:100%`，颜色随余量变化
- **Hover** — 鼠标悬停查看详细用量和重置时间
- **命令面板** — `Cmd+Shift+P` → `Kimi: Refresh Usage` 手动刷新
- **详情面板** — `Cmd+Shift+P` → `Kimi: Show Usage Details` 查看完整列表

---

## 环境变量汇总

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `KIMI_CODING_API_KEY` | ✅ | Kimi Coding Plan API Key |
| `KIMI_BASE_URL` | ❌ | API 基础地址，默认 `https://api.kimi.com/coding/v1` |

---

## License

MIT
