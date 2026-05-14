```text
 ██╗  ██╗ ██╗ ███╗   ███╗ ██╗     ██████╗  ██████╗  ██████╗  ███████╗
 ██║ ██╔╝ ██║ ████╗ ████║ ██║    ██╔════╝ ██╔═══██╗ ██╔══██╗ ██╔════╝
 █████╔╝  ██║ ██╔████╔██║ ██║    ██║      ██║   ██║ ██║  ██║ █████╗
 ██╔═██╗  ██║ ██║╚██╔╝██║ ██║    ██║      ██║   ██║ ██║  ██║ ██╔══╝
 ██║  ██╗ ██║ ██║ ╚═╝ ██║ ██║    ╚██████╗ ╚██████╔╝ ██████╔╝ ███████╗
 ╚═╝  ╚═╝ ╚═╝ ╚═╝     ╚═╝ ╚═╝     ╚═════╝  ╚═════╝  ╚═════╝  ╚══════╝
```

> *Here am I sitting in a tin can*  
> *Far above the world*  
> *Planet Earth is blue*  
> *And there's nothing I can do*  
>  
> — **David Bowie**, *Space Oddity* (1969)

# Kimi Code Usage (Kimi 轨道遥测仪)

<p align="center">
  <a href="#"><img src="https://img.shields.io/visual-studio-marketplace/v/HainingYu.kimi-code-usage.svg" alt="Marketplace"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="#"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome"></a>
</p>

<p align="center">
  <strong>Navigating your AI trajectory with orbital precision.</strong><br>
  <strong>以环月轨道的精度，感知你的 AI 资源余量。</strong>
</p>

---

### 🌑 Why Kimi Code Usage? | 为什么选择它？

In the vastness of the code universe, your creative flow shouldn't be pulled down by the unexpected gravity well of API quota limits. **Kimi Code Usage** acts as your orbital telemetry system. It brings transparency to your AI consumption, allowing you to focus on exploring the digital cosmos while maintaining full awareness of your life-support resources.

在广袤的代码宇宙中，你的灵感航线不应被突如其来的额度耗尽（引力井）所打断。**Kimi Code Usage** 如同你的专属轨道遥测仪，为你的 AI 消耗提供极简而透明的实时监控，让你在探索深空的专注中，对系统资源状况了然于胸。

---

### 🛰️ Telemetry Showcase | 遥测显示

```text
🌔 ▰▱▱  W:64% 5H:54%  > Moonwalk
--------------------------------------------------
| Kimi API Telemetry Details                     |
| Weekly: 64% left  [Warp Factor: -30% > Moonwalk]|
| 5 Hours: 54% left [Warp Factor: -30% > Moonwalk]|
| Resets Today 16:22 (in 3d 17h)                 |
--------------------------------------------------
```

---

### ✨ Systems | 核心组件

- **Orbital HUD | 轨道级状态栏**
  A sleek indicator showing your remaining API telemetry at a glance.
  极致简洁的百分比显示，一眼看清飞船的剩余能量。
- **Pace Indicator | 曲率引擎指针**
  Real-time consumption velocity with 10 theme presets. Know whether you're burning fuel too fast or cruising efficiently.
  实时追踪 API 消耗速率，10 款主题预设（动物、赛车、星战…），洞悉燃料燃烧节奏：
  - 🌒 **Fast** — Burning faster than elapsed time. Red alert background. 消耗速度超过时间进度，触发红色警报背景。
  - 🌓 **Normal** — Right on schedule. Steady cruising. 消耗与时间进度同步，平稳巡航。
  - 🌔 **Slow** — Conserving fuel, well below pace. 节省燃料，远低于预期消耗。
- **Deep Space Insights | 深空数据探针**
  Hover to reveal fuel status, refuel times, and warp factor deviations.
  悬浮触发燃料主题数据面板，掌握长周期与短周期限额的每一处细节。
- **Thruster Controls | 推进器微调**
  - `Kimi: Refresh Usage` — Instant telemetry sync. (立即同步雷达数据)
  - `Kimi: Show Details` — Deep dive into stats with absolute reset times. (查看深空数据面板，含精确重置时间)

---

### 🚀 Launch Sequence | 发射序列

1.  **Dock** the extension from the VS Code: Marketplace. (从商店安装扩展)
2.  **Calibrate** your API Key in Settings > `kimiCodeUsage.apiKey`, or via the `.env` module. (配置你的 API 密钥)
3.  **Liftoff!** Watch your quota manifest in the status bar. (点火起飞！在状态栏实时感知资源消耗)

---

### ⚙️ Navigation Specs | 导航配置

| Setting (配置节点) | Description (说明) | Default |
| :--- | :--- | :--- |
| `apiKey` | Your Kimi API secret / 核心密钥 | `KIMI_CODING_API_KEY` |
| `baseUrl` | API base URL / 接口基站 | `Kimi Coding V1` |
| `refreshIntervalMinutes` | Auto-sync minutes / 雷达刷新间隔 | `5` |
| `weeklyLowThresholdPercent` | Weekly low quota threshold (%) / 每周低余量告警阈值 | `30` |
| `fiveHourLowThresholdPercent` | 5-hour low quota threshold (%) / 5小时低余量告警阈值 | `30` |
| `showPaceIndicator` | Show pace indicator / 显示速度指针 | `true` |
| `paceTheme` | Pace label theme preset (10 themes) / 主题预设 | `Default` |
| `paceSensitivity` | Threshold sensitivity (Relaxed/Normal/Strict/Custom) / 灵敏度档位 | `Normal` |
| `paceThresholdFast` | Fast usage threshold / 用量过快阈值 | *(sensitivity preset)* |
| `paceThresholdSlow` | Slow usage threshold / 用量过慢阈值 | *(sensitivity preset)* |
| `paceLabels` | Custom pace labels (fast/normal/slow) / 自定义速度状态名称 | `{}` |
| `paceIcons` | Custom codicon names / 自定义状态图标名称 | `{}` |

---

### 📋 Changelog | 更新日志

**v0.1.6** — *Theme Engine & Threshold Control*
- 10 款速度指针主题预设（Default / Animals / Racing / Fish / Birds / Rocket / Running / STAR WARS / STAR TREK / BACK TO THE FUTURE）
- 4 档灵敏度联动阈值（Relaxed / Normal / Strict / Custom），档位切换自动同步阈值
- 自定义 Fast / Slow 分界阈值
- 状态栏用量边界 emoji（满额 🌕 / 耗尽 🌑）
- QuickPick 增加设置入口

**v0.1.5** — *Refined Telemetry*
- 品牌统一：Tom → Kimi
- 增强错误处理与状态栏提示

**v0.1.4** — *Pace Indicator*
- 实时消耗速率指针（Fast / Normal / Slow）
- 燃料主题悬浮提示与三格进度条
- 深空数据面板（QuickPick）

**v0.1.0** — *Liftoff*
- 状态栏余量监控与自动刷新

---

### 👨‍🚀 About the Commander | 关于指令长

Engineered with ❤️ by **Haining Yu**. This extension is a piece of digital architecture designed to bridge the gap between aesthetic curation and intuitive, AI-powered exploration.

由 **Haining Yu** 精心打磨。它不仅是一个开发工具，更是一件融合了美学策展与直觉化 AI 探索的数字航天舱组件。

---

<p align="center">
  <strong>See you on the dark side of the moon.</strong>
</p>
