# Pace Indicator Implementation Plan

> **Status:** All tasks completed. Design evolved during implementation; see final design doc for accurate spec.

**Goal:** Add a lunar-themed pace indicator to the VS Code: extension status bar, comparing actual usage against elapsed time to show Overload/Impulse/Moonwalk states.

**Architecture:** Extend the single `extension.ts` file with pure utility functions for pace calculation and formatting, then integrate them into `refresh()` and `showDetails()`. A single toggle in `package.json` controls visibility. Dynamic window duration support added for 5h and monthly limits.

**Tech Stack:** TypeScript, VS Code: Extension API, existing https-based API fetch.

---

## File Map

| File | Responsibility | Action |
|---|---|---|
| `vscode-extension/src/extension.ts` | All extension logic — pace calculation, state bar assembly, QuickPick details, hover tooltip | Modify |
| `vscode-extension/package.json` | Extension manifest — commands, configuration schema | Modify |
| `vscode-extension/l10n/bundle.l10n.zh-cn.json` | Chinese translations for new strings | Modify |
| `vscode-extension/l10n/bundle.l10n.json` | Default (English) l10n bundle | Modify |

---

## Task 1: Extend UsageItem and Extract reset_seconds / reset_at

- [x] **Step 1: Add `reset_seconds` and `reset_at` to UsageItem interface**

```typescript
interface UsageItem {
  label: string;
  used: number;
  limit: number;
  remaining: number;
  percent_left: number;
  reset_hint: string | null;
  reset_seconds: number | null; // NEW
  reset_at: string | null;      // NEW
}
```

- [x] **Step 2: Populate reset_seconds and reset_at in toRow()**

Extract `reset_seconds` from `reset_in` / `resetAt` / `ttl` fields, with fallback parsing from ISO timestamps (`reset_at` / `resetAt` / `reset_time`). Also extract raw `reset_at` string for hover display.

- [x] **Step 3: Commit**

---

## Task 2: Add Pace Calculation and Formatting Utilities

- [x] **Step 1: Add PaceState type, computePace(), and getWindowSeconds()**

```typescript
interface PaceState {
  ratio: number;
  state: 'warp' | 'impulse' | 'moonwalk';
}

function computePace(item: UsageItem, windowSeconds: number): PaceState | null
function getWindowSeconds(label: string): number
```

`computePace` now accepts a dynamic `windowSeconds` parameter (weekly=604800s, 5h=18000s, monthly=2592000s).

- [x] **Step 2: Add formatPaceBar()**

3-bar gauge: Overload=▰▰▰, Impulse=▰▰▱, Moonwalk=▰▱▱.

- [x] **Step 3: Add formatResetTimeAbsolute()**

Returns `{ absolute, relative }` for hover/QuickPick display.

- [x] **Step 4: Commit**

---

## Task 3: Integrate Pace Indicator into refresh()

- [x] **Step 1: Modify refresh() to compute and display pace**

Key changes from original plan:
- Removed "Kimi" prefix and ratio number from status bar text
- Added codicons: `$(warning)` for Overload, `$(dashboard)` for Impulse, `$(debug-step-over)` for Moonwalk
- Overload triggers **red background** (`statusBarItem.errorBackground`)
- Removed old quota-based background color logic
- Hover tooltip completely redesigned with fuel theme and merged pace line

- [x] **Step 2: Commit**

---

## Task 4: Update showDetails() with Pace Info

- [x] **Step 1: Modify showDetails()**

Key changes from original plan:
- Removed `description` field (was too small); merged all info into `label`
- Added per-item pace calculation (`[Warp Factor: -26.33% > Moonwalk]`)
- Beautified quota names: `Weekly limit` → `Weekly`, `5h limit` → `5 Hours`
- Reset time appended to label with "Resets" prefix

- [x] **Step 2: Commit**

---

## Task 5: Simplify Chinese shortLabel

- [x] **Step 1: Update shortLabel()**

```typescript
function shortLabel(label: string): string {
  // '周' / 'W', '5时' / '5H', '月' / 'M'
}
```

- [x] **Step 2: Commit**

---

## Task 6: Add package.json Configuration

- [x] **Step 1: Add showPaceIndicator setting**

```json
"kimiCodeUsage.showPaceIndicator": {
  "type": "boolean",
  "default": true,
  "description": "Show pace indicator (Overload/Impulse/Moonwalk) / 显示速度指针（曲率/脉冲/月球漫步）"
}
```

- [x] **Step 2: Commit**

---

## Task 7: Add l10n Strings

- [x] **Step 1: Update English l10n bundle**

```json
{
  "Overload": "Overload",
  "Impulse": "Impulse",
  "Moonwalk": "Moonwalk",
  "Pace": "Pace",
  "Expected": "Expected",
  "Actual": "Actual"
}
```

- [x] **Step 2: Update Chinese l10n bundle**

```json
{
  "Overload": "曲率加速",
  "Impulse": "脉冲推进",
  "Moonwalk": "月球漫步",
  "Pace": "配速",
  "Expected": "应耗",
  "Actual": "实耗",
  "left": "剩余",
  "Kimi API key not configured.": "未配置 Kimi API 密钥。",
  "Kimi usage fetch failed: {0}": "获取 Kimi 用量失败: {0}",
  "Kimi API Usage Details": "Kimi API 用量详情",
  "No usage data": "无用量数据"
}
```

- [x] **Step 3: Commit**

---

## Task 8: Local Testing

- [x] **Step 1: Compile the extension**

```bash
cd /Users/hainingyu/Code/kimi_usage/vscode-extension
npm run compile
```

- [x] **Step 2: Launch Extension Development Host**

Press `F5` or Run → "Start Debugging".

- [x] **Step 3: Verify all three pace states**

Tested with simulated data:
- **Overload**: red background + `$(warning)` icon
- **Impulse**: `$(dashboard)` icon
- **Moonwalk**: `$(debug-step-over)` icon

- [x] **Step 4: Verify Chinese/English switching**

Set `kimiCodeUsage.language` to `Chinese` / `Auto` / `English`.

- [x] **Step 5: Verify disabled state**

Uncheck `showPaceIndicator` → reverts to pre-feature format.

- [x] **Step 6: Verify error states**

No API key → `$(warning) Major Tom?`
Invalid baseUrl → `$(sync~spin) Starman...`

---

## Design Evolution Notes

During implementation, the following design decisions were refined through iterative testing:

| Original Plan | Final Decision | Rationale |
|---|---|---|
| 5-bar ASCII gauge | 3-bar gauge | User found 5 bars too cluttered |
| State name "Warp" | "Overload" | User preferred "Overload" for clarity |
| Status bar: `🌒 Kimi Warp ▰▰▰▰▱ 1.4x W:42%` | `🌓 ▰▰▱ W:67% 5H:70% > Impulse` | User wanted minimal text, no "Kimi", no ratio |
| Hover: per-item pace + Expected/Actual | Hover: fuel theme + merged pace line | User preferred simpler, themed tooltip |
| Only weekly gets pace | All quotas get pace | User wanted 5h pace too |
| Background color quota-driven | Background color pace-driven (Overload=red) | User wanted Overload to be visually urgent |
| QuickPick `description` field | Merged into `label` | User disliked font size inconsistency |
