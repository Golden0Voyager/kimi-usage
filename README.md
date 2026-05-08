<p align="center">
  <img src="vscode-extension/assets/banner.png" width="100%" alt="Kimi Code Usage Banner">
</p>

# Kimi Code Usage: The Curated Toolchain

**Manifesting your AI quota with aesthetic precision across CLI, MCP, and VS Code.**
**以优雅的姿态，在终端、AI 助手与编辑器中感知你的 AI 额度。**

---

### 🌟 Project Vision | 项目愿景

In the era of "Vibecoding," transparency of resources is a prerequisite for flow. **Kimi Code Usage** is a meticulously crafted toolchain designed to bridge the gap between technical data and intuitive curation.

在“直觉编程”时代，资源的透明度是进入心流状态的前提。**Kimi Code Usage** 是一套精心打磨的工具链，旨在技术数据与审美策展之间建立桥梁。

---

### 📦 Components | 组件矩阵

1.  **💎 VS Code Extension** ([Go to Marketplace](https://marketplace.visualstudio.com/items?itemName=HainingYu.kimi-code-usage))
    A sleek indicator in your status bar with sensory alerting.
    极致简洁的状态栏百分比显示与视觉化预警。
2.  **🔍 MCP Server (Model Context Protocol)**
    Exposes `get_kimi_usage` to AI Agents (Claude Code, Cursor, Windsurf).
    供 AI 智能体调用的标准化能力接口。
3.  **⚡ CLI Reporter**
    Terminal-based Rich panel for instant insights.
    基于终端的彩色面板，快速洞察配额细节。

---

### 🛠️ Prerequisites | 前提条件

- **Kimi Coding Plan** API Key (from [Kimi Coding v1](https://api.kimi.com/coding/v1))
- Python 3.10+ (for MCP & CLI)
- VS Code (for Extension)

---

### ⚡ CLI & MCP Setup | 安装与配置

The easiest way to install the toolchain is via **pip** or **uv**:
最简单的安装方式是通过 **pip** 或 **uv**：

```bash
pip install kimi-code-usage
# OR run instantly without installing
uvx kimi-code-usage
```

#### CLI Usage | 终端使用
```bash
kimi-usage          # Show aesthetic panel
kimi-usage --json   # Output as JSON
```

#### MCP Server Setup | AI 智能体配置
Compatible with **Claude Code, Cursor, and Windsurf**.
兼容所有支持 MCP 协议的 AI 助手。

Add this to your MCP configuration file (e.g., `~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "kimi-code-usage": {
      "command": "uvx",
      "args": ["kimi-code-usage", "kimi-mcp"],
      "env": {
        "KIMI_API_KEY": "YOUR_KEY"
      }
    }
  }
}
```

---

### 🎨 About the Curator | 关于策展人

Crafted with ❤️ by **Haining Yu**, an Art Curator and Vibecoder. This toolchain is part of a curated collection designed to bridge the gap between aesthetic curation and intuitive, AI-powered coding.

由 **Haining Yu** 精心打磨。作为一名艺术策展人与 Vibecoder，我将代码视作展览，力求在审美策展与直觉化 AI 编程之间寻找完美的平衡。

---

<p align="center">
  <strong>Enjoy the flow. Stay in the vibe.</strong>
</p>
