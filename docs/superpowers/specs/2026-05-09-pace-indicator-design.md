# Pace Indicator Design — 速度指针

## 1. Overview

Add a **pace indicator** to the VS Code: extension status bar that compares actual weekly usage against expected usage based on elapsed time. Think of it as a spaceship throttle gauge: if you're burning through your weekly quota faster than the calendar, you're in Warp; if you're right on schedule, you're cruising at Impulse; if you're conserving, you're Moonwalking.

**Scope**: VS Code: extension only. This is a pure UI/UX enhancement to the existing status bar + QuickPick flow.

## 2. Concept

```
pace ratio = actual_used_percent / elapsed_time_percent
```

- **elapsed_time_percent** = `seconds_elapsed_in_window / total_window_seconds`
- **actual_used_percent** = `used / limit`

Only the **weekly** limit gets a pace indicator. Short windows (e.g. 5h) have no meaningful "cruise vs overspeed" semantics and are excluded.

## 3. Three-State Model

| Pace Ratio | State (EN) | State (CN) | Moon Emoji | ASCII Bar | Background Color |
|---|---|---|---|---|---|
| ≥ 1.1x | **Warp** | 曲率加速 | 🌒 | ▰▰▰▰▱ or ▰▰▰▰▰ | Unchanged (pace does not affect bg) |
| 0.9x – 1.1x | **Impulse** | 脉冲推进 | 🌓 | ▰▰▰▱▱ | Unchanged |
| ≤ 0.9x | **Moonwalk** | 月球漫步 | 🌔 | ▰▰▱▱▱ or ▰▱▱▱▱ | Unchanged |

### 3.1 ASCII Bar Fill Logic

```
> 1.5x   → 5 bars (▰▰▰▰▰)
1.1–1.5x → 4 bars (▰▰▰▰▱)
0.9–1.1x → 3 bars (▰▰▰▱▱)  ← cruise baseline
0.5–0.9x → 2 bars (▰▰▱▱▱)
< 0.5x   → 1 bar  (▰▱▱▱▱)
```

### 3.2 Moon Phase Narrative

The moon emoji follows a **waxing** progression: the slower you go, the fuller the moon. This creates a poetic visual arc from a sliver of urgency (Warp) to the calm fullness of leisure (Moonwalk).

## 4. Status Bar Format

### 4.1 English Mode

```
🌒 Kimi Warp     ▰▰▰▰▱  W:42%  5H:99%
🌓 Kimi Impulse  ▰▰▰▱▱  W:25%  5H:99%
🌔 Kimi Moonwalk ▰▱▱▱▱  W:8%   5H:99%
```

### 4.2 Chinese Mode

```
🌒 Kimi 曲率加速  ▰▰▰▰▱  周:42%  5时:99%
🌓 Kimi 脉冲推进  ▰▰▰▱▱  周:25%  5时:99%
🌔 Kimi 月球漫步  ▰▱▱▱▱  周:8%   5时:99%
```

### 4.3 Layout Rules

- **Order**: `🌒 Kimi <State> <ASCII-Bar> <Ratio> W:xx% 5H:xx%`
- **Separator between Kimi and State**: single space (no dot, no pipe)
- The pace indicator (`<State> <ASCII-Bar> <Ratio>`) sits **before** the percentage values
- Error states retain icons: `$(warning) no key`, `$(sync~spin) err`

## 5. Hover Tooltip

```
Weekly limit: 4,200 / 10,000 (42% left)
  🌒 Pace 1.4x — 曲率加速 Warp
  Expected 35.7%  ·  Actual 57.0%
  🛸 Resets Thu 04:23 · 5d 3h left
5h limit: 9,900 / 10,000 (99% left)
  Resets today 04:35 · 4h 12m left
```

## 6. QuickPick Detail View

Triggered by clicking the status bar item. Shows absolute reset time + remaining duration.

```
🌒 Weekly limit: 42% left      4,200 / 10,000  ·  Resets Thu 04:23 · 5d 3h left
   5h limit:     99% left      9,900 / 10,000  ·  Resets today 04:35 · 4h 12m left
```

### 6.1 Reset Time Format

| Scenario | Chinese | English |
|---|---|---|
| ≥ 24 hours to reset | `周四 04:23 重置 · 剩 5d 3h` | `Resets Thu 04:23 · 5d 3h left` |
| < 24 hours to reset | `今天 04:35 重置 · 剩 4h 12m` | `Resets today 04:35 · 4h 12m left` |
| Already expired | `已重置` | `reset` |
| No reset time from API | (omitted) | (omitted) |

- Uses **24-hour format** (no AM/PM ambiguity)
- Uses **local timezone** (JavaScript `Date` default behavior)
- Applies to **all usage items**, not just weekly

## 7. Background Color Logic

Background color is **unchanged** from the existing behavior. Pace indicator does not trigger background color changes.

| Signal | Trigger | Background |
|---|---|---|
| Quota critical | `percent_left ≤ criticalPercent` (default 10%) | Red (`statusBarItem.errorBackground`) |
| Quota warning | `percent_left ≤ warnPercent` (default 30%) | Yellow (`statusBarItem.warningBackground`) |
| Pace states | Any ratio | **No effect** |

The pace indicator is a purely visual, non-intrusive signal. Background color remains strictly quota-driven.

## 8. Configuration

Single toggle to disable the feature:

```json
"kimiCodeUsage.showPaceIndicator": {
  "type": "boolean",
  "default": true,
  "description": "Show pace indicator (Warp/Impulse/Moonwalk) / 显示速度指针（曲率/脉冲/月球漫步）"
}
```

Threshold values (0.9 / 1.1) and bar fill logic are **not configurable** in v1. They can be exposed later if users request flexibility.

## 9. Out of Scope (YAGNI)

- Desktop notifications / popups on state change
- Configurable pace thresholds
- Historical trend charts or daily/weekly reports
- Pace indicator for non-weekly windows (e.g. 5h)

## 10. Edge Cases

| Scenario | Handling |
|---|---|
| API returns no `reset_in` / `reset_at` | Skip pace display entirely; show only `W:42% 5H:99%` |
| Window just started (< 1 hour elapsed) | Skip pace judgment; display ▰▰▰▱▱ (cruise placeholder) |
| `elapsed_time ≥ total_window` | Calculate normally; cap ratio display at 5.0x |
| `limit = 0` or `used = 0` | Skip pace indicator for this item |
| `showPaceIndicator = false` | Revert to pre-feature status bar format |

## 11. Code Structure

Keep changes in the existing single file `vscode-extension/src/extension.ts`:

1. **New constant**: `WEEKLY_WINDOW_SECONDS = 7 * 24 * 3600`
2. **New pure function**: `computePace(item: UsageItem): PaceState | null`
3. **Modified `refresh()`**: Assemble pace text and prepend to status bar string
4. **Modified `formatResetTime()`**: Return absolute time + relative duration
5. **New l10n strings**: See §12

Estimated change: **~80 lines**, no new files.

## 12. i18n Strings

```
"Warp": "曲率加速"
"Impulse": "脉冲推进"
"Moonwalk": "月球漫步"
"Pace {0}x — {1}": "速度比 {0}x — {1}"
"Expected {0}%  ·  Actual {1}%": "应耗 {0}%  ·  实耗 {1}%"
"Resets {0} · {1} left": "{0} 重置 · 剩 {1}"
```

## 13. Implementation Constraint

- **Local testing only**: After implementation, test locally in VS Code: (F5 → Extension Development Host). Do **not** package or publish (no `vsce package` / `vsce publish`) until explicitly requested.
