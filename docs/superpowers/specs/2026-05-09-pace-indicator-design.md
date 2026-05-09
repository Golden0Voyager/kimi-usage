# Pace Indicator Design — 速度指针

## 1. Overview

Add a **pace indicator** to the VS Code: extension status bar that compares actual usage against expected usage based on elapsed time. Think of it as a spaceship throttle gauge: if you're burning through your quota faster than the calendar, you're in **Overload**; if you're right on schedule, you're cruising at **Impulse**; if you're conserving, you're **Moonwalking**.

**Scope**: VS Code: extension only. This is a pure UI/UX enhancement to the existing status bar + QuickPick flow.

## 2. Concept

```
pace ratio = actual_used_percent / elapsed_time_percent
```

- **elapsed_time_percent** = `seconds_elapsed_in_window / total_window_seconds`
- **actual_used_percent** = `used / limit`

All limits get a pace indicator (weekly, 5h, monthly). Window duration is inferred from the limit label.

## 3. Three-State Model

| Pace Ratio | State (EN) | State (CN) | Moon Emoji | ASCII Bar | Status Bar Icon | Background Color |
|---|---|---|---|---|---|---|
| ≥ 1.1x | **Overload** | 曲率加速 | 🌒 | ▰▰▰ | `$(warning)` | **Red** (`statusBarItem.errorBackground`) |
| 0.9x – 1.1x | **Impulse** | 脉冲推进 | 🌓 | ▰▰▱ | `$(dashboard)` | Unchanged |
| ≤ 0.9x | **Moonwalk** | 月球漫步 | 🌔 | ▰▱▱ | `$(debug-step-over)` | Unchanged |

### 3.1 ASCII Bar Fill Logic

```
≥ 1.1x   → 3 bars (▰▰▰)  // Overload
0.9–1.1x → 2 bars (▰▰▱)  // Impulse (cruise baseline)
≤ 0.9x   → 1 bar  (▰▱▱)  // Moonwalk
```

### 3.2 Moon Phase Narrative

The moon emoji follows a **waxing** progression: the slower you go, the fuller the moon. This creates a poetic visual arc from a sliver of urgency (Overload) to the calm fullness of leisure (Moonwalk).

## 4. Status Bar Format

### 4.1 English Mode

```
🌒 ▰▰▰  W:18%  5H:18%  > $(warning) Overload
🌓 ▰▰▱  W:50%  5H:50%  > $(dashboard) Impulse
🌔 ▰▱▱  W:80%  5H:80%  > $(debug-step-over) Moonwalk
```

### 4.2 Chinese Mode

```
🌒 ▰▰▱  周:18%  5时:18%  > $(warning) 曲率加速
🌓 ▰▰▱  周:50%  5时:50%  > $(dashboard) 脉冲推进
🌔 ▰▱▱  周:80%  5时:80%  > $(debug-step-over) 月球漫步
```

### 4.3 Layout Rules

- **Order**: `<MoonEmoji> <Bar> <Percentages> > <Icon> <StateName>`
- **Percentages first**: all usage items shown as `ShortLabel:xx%`
- **Pace suffix last**: state name with codicon appended after `>`
- **No ratio number in status bar**: the exact `1.4x` is shown only in hover/QuickPick
- **Error states retain icons**: `$(warning) Major Tom?`, `$(sync~spin) Starman...`

## 5. Hover Tooltip

```
<center>每周：剩余燃料：3d 17h left | 重新装填：Today 16:22</center>
<center>每5小时：剩余燃料：2h 30m left | 重新装填：Today 16:22</center>
<center>曲率：每周 -26.33% | 每5小时 -60.00%</center>
```

- **Fuel theme**: "剩余燃料" / "Fuel remaining" for time left, "重新装填" / "Refuel" for reset time
- **Pace merged to one line**: all quota deviations displayed together, separated by `|`
- **No state name in hover pace line**: deviation percentages alone are sufficient
- **HTML centering**: uses `<center>` tags with `supportHtml = true`

## 6. QuickPick Detail View

Triggered by clicking the status bar item.

```
Weekly: 65% left    [Warp Factor: -26.33% > Moonwalk]    Resets Wed 16:22 (in 3d 17h)
5 Hours: 59% left   [Warp Factor: -30.43% > Moonwalk]    Resets Wed 16:22 (in 3d 17h)
```

- **Beautified labels**: `Weekly limit` → `Weekly`, `5h limit` → `5 Hours`
- **Pace info appended**: `[Warp Factor: -26.33% > Moonwalk]` shown for every quota item
- **Reset time in label**: merged into the main label (not description) for consistent font size

### 6.1 Reset Time Format

| Scenario | Chinese | English |
|---|---|---|
| ≥ 24 hours to reset | `剩 3天 17时 · 周四 04:23` | `3d 17h left · Reset: Thu 04:23` |
| < 24 hours to reset | `剩 4时 12分 · 今天 04:35` | `4h 12m left · Reset: Today 04:35` |
| Already expired | `已重置` | `reset` |

- Uses **24-hour format** (no AM/PM ambiguity)
- Uses **local timezone** (JavaScript `Date` default behavior)
- Applies to **all usage items**, not just weekly

## 7. Background Color Logic

Background color is **pace-driven**, not quota-driven.

| Signal | Trigger | Background |
|---|---|---|
| Overload | `pace.state === 'warp'` | **Red** (`statusBarItem.errorBackground`) |
| Moonwalk | `pace.state === 'moonwalk'` | **Light green** (`kimiCodeUsage.moonwalkBackground`) |
| Impulse | Any other ratio | **None** (undefined) |

The old quota-based background color logic (critical/warn percent thresholds) has been removed. The pace indicator is now the primary visual alert signal.

The Moonwalk color is contributed as a custom theme color with defaults `#d4edda` (light) and `#1b4332` (dark / high-contrast) so it remains readable across themes.

## 8. Configuration

Single toggle to disable the feature:

```json
"kimiCodeUsage.showPaceIndicator": {
  "type": "boolean",
  "default": true,
  "description": "Show pace indicator (Overload/Impulse/Moonwalk) / 显示速度指针（曲率/脉冲/月球漫步）"
}
```

Threshold values (0.9 / 1.1) and bar fill logic are **not configurable** in v1. They can be exposed later if users request flexibility.

## 9. Out of Scope (YAGNI)

- Desktop notifications / popups on state change
- Configurable pace thresholds
- Historical trend charts or daily/weekly reports

## 10. Edge Cases

| Scenario | Handling |
|---|---|
| API returns no `reset_in` / `reset_at` | Skip pace display entirely; show only `W:42% 5H:99%` |
| Window just started (< 1 hour elapsed) | Skip pace judgment; display ▰▰▱ (Impulse placeholder) |
| `elapsed_time ≥ total_window` | Calculate normally; cap ratio display at 5.0x |
| `limit = 0` or `used = 0` | Skip pace indicator for this item |
| `showPaceIndicator = false` | Revert to pre-feature status bar format |
| Weekly and 5h have different pace states | Hover shows both deviations; status bar icon follows **weekly** state |

## 11. Code Structure

Changes in `vscode-extension/src/extension.ts`:

1. **New constant**: `WEEKLY_WINDOW_SECONDS = 7 * 24 * 3600`
2. **New function**: `getWindowSeconds(label: string): number` — dynamic window detection
3. **Modified `computePace()`**: accepts `windowSeconds` parameter
4. **Modified `refresh()`**: assemble pace text with codicons + background color
5. **Modified `showDetails()`**: beautified labels + per-item pace
6. **Modified hover builder**: fuel theme + merged pace line
7. **New l10n strings**: See §12

Estimated change: **~120 lines**.

## 12. i18n Strings

```json
// English (bundle.l10n.json)
{
  "Overload": "Overload",
  "Impulse": "Impulse",
  "Moonwalk": "Moonwalk",
  "left": "left"
}

// Chinese (bundle.l10n.zh-cn.json)
{
  "Overload": "曲率加速",
  "Impulse": "脉冲推进",
  "Moonwalk": "月球漫步",
  "left": "剩余",
  "Kimi API key not configured.": "未配置 Kimi API 密钥。",
  "Kimi usage fetch failed: {0}": "获取 Kimi 用量失败: {0}",
  "Kimi API Usage Details": "Kimi API 用量详情",
  "No usage data": "无用量数据"
}
```

## 13. Implementation Constraint

- **Local testing only**: After implementation, test locally in VS Code: (F5 → Extension Development Host). Do **not** package or publish (no `vsce package` / `vsce publish`) until explicitly requested.
