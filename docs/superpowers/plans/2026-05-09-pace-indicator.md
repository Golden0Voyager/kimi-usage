# Pace Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a lunar-themed pace indicator to the VS Code: extension status bar, comparing weekly usage against elapsed time to show Warp/Impulse/Moonwalk states.

**Architecture:** Extend the single `extension.ts` file with pure utility functions for pace calculation and formatting, then integrate them into `refresh()` and `showDetails()`. A single toggle in `package.json` controls visibility. All changes are surgical (~80 lines) with no new files.

**Tech Stack:** TypeScript, VS Code: Extension API, existing https-based API fetch.

---

## File Map

| File | Responsibility | Action |
|---|---|---|
| `vscode-extension/src/extension.ts` | All extension logic — pace calculation, state bar assembly, QuickPick details | Modify |
| `vscode-extension/package.json` | Extension manifest — commands, configuration schema | Modify |
| `vscode-extension/l10n/bundle.l10n.zh-cn.json` | Chinese translations for new strings | Modify (if exists, else create) |
| `vscode-extension/l10n/bundle.l10n.json` | Default (English) l10n bundle | Modify (if exists, else create) |

---

## Constants

```typescript
const WEEKLY_WINDOW_SECONDS = 7 * 24 * 3600; // 604800
```

---

## Task 1: Extend UsageItem and Extract reset_seconds

**Files:**
- Modify: `vscode-extension/src/extension.ts:6-13`

- [ ] **Step 1: Add `reset_seconds` to UsageItem interface**

```typescript
interface UsageItem {
  label: string;
  used: number;
  limit: number;
  remaining: number;
  percent_left: number;
  reset_hint: string | null;
  reset_seconds: number | null; // NEW
}
```

- [ ] **Step 2: Populate reset_seconds in toRow()**

In `toRow()` (around line 251-268), add reset_seconds extraction before the return statement:

```typescript
function toRow(data: any, defaultLabel: string): UsageItem | null {
  const limit = toInt(data.limit);
  let used = toInt(data.used);
  if (used == null) {
    const remaining = toInt(data.remaining);
    if (remaining != null && limit != null) used = limit - remaining;
  }
  if (used == null && limit == null) return null;
  const u = used ?? 0;
  const l = limit ?? 0;

  // Extract raw reset seconds for pace calculation
  let reset_seconds: number | null = null;
  for (const key of ['reset_in', 'resetIn', 'ttl']) {
    const s = toInt(data[key]);
    if (s != null) { reset_seconds = s; break; }
  }

  return {
    label: String(data.name || data.title || defaultLabel),
    used: u,
    limit: l,
    remaining: l - u,
    percent_left: l > 0 ? ((l - u) / l) * 100 : 0,
    reset_hint: resetHint(data),
    reset_seconds,
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add vscode-extension/src/extension.ts
git commit -m "$(cat <<'EOF'
feat: add reset_seconds to UsageItem for pace calculation

在 UsageItem 接口中新增 reset_seconds 字段，
用于后续计算时间进度与用量进度的速度比。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add Pace Calculation and Formatting Utilities

**Files:**
- Modify: `vscode-extension/src/extension.ts`

- [ ] **Step 1: Add PaceState type and computePace()**

Insert after the `UsageItem` interface (before `let statusBarItem`):

```typescript
interface PaceState {
  ratio: number;
  state: 'warp' | 'impulse' | 'moonwalk';
}

const WEEKLY_WINDOW_SECONDS = 7 * 24 * 3600;

function computePace(item: UsageItem): PaceState | null {
  if (!item.reset_seconds || item.reset_seconds <= 0) return null;
  if (item.limit <= 0) return null;

  const elapsed = WEEKLY_WINDOW_SECONDS - item.reset_seconds;
  if (elapsed <= 0 || elapsed < 3600) return null; // Skip if < 1 hour elapsed

  const actualUsedRatio = item.used / item.limit;
  const elapsedRatio = elapsed / WEEKLY_WINDOW_SECONDS;

  const rawRatio = elapsedRatio > 0 ? actualUsedRatio / elapsedRatio : 0;
  const ratio = Math.min(rawRatio, 5.0);

  let state: 'warp' | 'impulse' | 'moonwalk';
  if (ratio >= 1.1) state = 'warp';
  else if (ratio <= 0.9) state = 'moonwalk';
  else state = 'impulse';

  return { ratio, state };
}
```

- [ ] **Step 2: Add formatPaceBar()**

Insert after `computePace()`:

```typescript
function formatPaceBar(ratio: number): string {
  let filled: number;
  if (ratio > 1.5) filled = 5;
  else if (ratio >= 1.1) filled = 4;
  else if (ratio >= 0.9) filled = 3;
  else if (ratio >= 0.5) filled = 2;
  else filled = 1;
  return '▰'.repeat(filled) + '▱'.repeat(5 - filled);
}
```

> Note: `▰` = ▰ (filled), `▱` = ▱ (empty)

- [ ] **Step 3: Add formatResetTimeAbsolute()**

Insert after `formatDuration()` (around line 328):

```typescript
function formatResetTimeAbsolute(val: string): { absolute: string; relative: string } {
  try {
    let iso = val;
    if (iso.includes('.') && iso.endsWith('Z')) {
      const [base, frac] = iso.slice(0, -1).split('.');
      iso = `${base}.${frac.slice(0, 6)}Z`;
    }
    const dt = new Date(iso.replace('Z', '+00:00'));
    const now = new Date();
    const sec = Math.floor((dt.getTime() - now.getTime()) / 1000);

    const relative = sec <= 0 ? 'reset' : formatDuration(sec);

    // Build absolute time string
    const hours = dt.getHours().toString().padStart(2, '0');
    const mins = dt.getMinutes().toString().padStart(2, '0');
    const isZh = translator.t('left') === '剩余';

    if (sec < 86400 && sec > 0) {
      // Less than 24 hours
      const absolute = isZh
        ? `今天 ${hours}:${mins}`
        : `today ${hours}:${mins}`;
      return { absolute, relative };
    }

    const weekdays = isZh
      ? ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
      : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const wd = weekdays[dt.getDay()];

    const absolute = isZh
      ? `${wd} ${hours}:${mins}`
      : `${wd} ${hours}:${mins}`;

    return { absolute, relative };
  } catch {
    return { absolute: val, relative: 'unknown' };
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add vscode-extension/src/extension.ts
git commit -m "$(cat <<'EOF'
feat: add pace calculation and formatting utilities

新增 computePace()、formatPaceBar()、formatResetTimeAbsolute()
三个纯工具函数，不改动任何现有行为。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Integrate Pace Indicator into refresh()

**Files:**
- Modify: `vscode-extension/src/extension.ts:144-189`

- [ ] **Step 1: Modify refresh() to compute and display pace**

Replace the normal-path body of `refresh()` (the `try` block, lines ~156-183):

```typescript
  try {
    const data = await fetchUsage(baseUrl, apiKey);
    const items = parsePayload(data);

    if (items.length === 0) {
      statusBarItem.text = `$(chip) ${t('Kimi: --')}`;
      statusBarItem.tooltip = t('No usage data');
      statusBarItem.backgroundColor = undefined;
      return;
    }

    // Find weekly item for pace calculation
    const weeklyItem = items.find(i => {
      const lower = i.label.toLowerCase();
      return lower.includes('weekly') || lower.includes('week') || lower.includes('周');
    });

    const showPace = cfg.get<boolean>('showPaceIndicator', true);
    let pace: PaceState | null = null;
    if (weeklyItem && showPace) {
      pace = computePace(weeklyItem);
    }

    // Build prefix with moon emoji + state
    const moonEmoji = pace
      ? (pace.state === 'warp' ? '🌒' : pace.state === 'impulse' ? '🌓' : '🌔')
      : '🌓';
    const stateName = pace
      ? t(pace.state === 'warp' ? 'Warp' : pace.state === 'impulse' ? 'Impulse' : 'Moonwalk')
      : t('Impulse');
    const bar = pace ? formatPaceBar(pace.ratio) : '▰▰▰▱▱';
    const ratioText = pace ? `${pace.ratio.toFixed(1)}x` : '';

    const prefix = `${moonEmoji} Kimi ${stateName} ${bar} ${ratioText}`.trim();

    const parts = items.map(i => `${shortLabel(i.label)}:${i.percent_left.toFixed(0)}%`);
    statusBarItem.text = `${prefix} ${parts.join(' ')}`;

    // Tooltip with pace details
    const tooltipLines: string[] = [];
    for (const i of items) {
      let line = `${i.label}: ${i.used.toLocaleString()}/${i.limit.toLocaleString()} (${i.percent_left.toFixed(0)}% ${t('left')})`;
      if (i.reset_hint) {
        line += ' — ' + i.reset_hint;
      }
      tooltipLines.push(line);

      // Add pace detail for weekly item
      if (i === weeklyItem && pace) {
        const elapsedRatio = Math.min(1, (WEEKLY_WINDOW_SECONDS - (i.reset_seconds ?? 0)) / WEEKLY_WINDOW_SECONDS);
        const expected = elapsedRatio * 100;
        const actual = ((i.used / i.limit) * 100);
        tooltipLines.push(`  ${formatPaceBar(pace.ratio)} Pace ${pace.ratio.toFixed(1)}x — ${stateName}`);
        tooltipLines.push(`  ${t('Expected')} ${expected.toFixed(1)}%  ·  ${t('Actual')} ${actual.toFixed(1)}%`);
      }
    }
    statusBarItem.tooltip = tooltipLines.join('\n');

    const minPercent = Math.min(...items.map(i => i.percent_left));
    if (minPercent <= cfg.get<number>('criticalPercent', 10)) {
      statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    } else if (minPercent <= cfg.get<number>('warnPercent', 30)) {
      statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      statusBarItem.backgroundColor = undefined;
    }
  } catch (err) {
    statusBarItem.text = `$(sync~spin) ${t('Kimi: err')}`;
    statusBarItem.tooltip = String(err);
    statusBarItem.backgroundColor = undefined;
  }
```

- [ ] **Step 2: Verify error paths still use codicons**

Confirm these two blocks are still present (should be unchanged):

No key:
```typescript
if (!apiKey) {
  statusBarItem.text = `$(warning) ${t('Kimi: no key')}`;
  statusBarItem.tooltip = t('Set apiKey in VS Code: settings or KIMI_CODING_API_KEY env var');
  statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
  return;
}
```

Fetch error (the `catch` block above already preserves this).

- [ ] **Step 3: Commit**

```bash
git add vscode-extension/src/extension.ts
git commit -m "$(cat <<'EOF'
feat: integrate pace indicator into status bar refresh

refresh() 函数整合速度指针显示：
- 月相 emoji 随档位变化（🌒/🌓/🌔）
- ASCII 进度档 + 倍率前置到百分比前方
- Hover 提示新增应耗/实耗详情
- 错误状态保留 codicon 图标

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Update showDetails() with Absolute Reset Time

**Files:**
- Modify: `vscode-extension/src/extension.ts:351-372`

- [ ] **Step 1: Modify showDetails() to use absolute reset time**

Replace `showDetails()`:

```typescript
async function showDetails() {
  const cfg = vscode.workspace.getConfiguration('kimiCodeUsage');
  const apiKey = await resolveApiKey();
  const baseUrl = cfg.get<string>('baseUrl', 'https://api.kimi.com/coding/v1');

  if (!apiKey) {
    vscode.window.showWarningMessage(t('Kimi API key not configured.'));
    return;
  }

  try {
    const data = await fetchUsage(baseUrl, apiKey);
    const items = parsePayload(data);

    const picks = items.map((i) => {
      let description = `${i.used.toLocaleString()} / ${i.limit.toLocaleString()}`;

      // Try to show absolute reset time
      const raw = data?.usage || data?.limits?.find((l: any) => {
        const detail = l?.detail || l;
        return (detail?.name || detail?.title || '') === i.label;
      });
      const detailData = raw?.detail || raw;
      if (detailData) {
        for (const key of ['reset_at', 'resetAt', 'reset_time', 'resetTime']) {
          const v = detailData[key];
          if (v) {
            const formatted = formatResetTimeAbsolute(String(v));
            const isZh = translator.t('left') === '剩余';
            if (isZh) {
              description += `  ·  ${formatted.absolute}重置 · ${formatted.relative}`;
            } else {
              description += `  ·  Resets ${formatted.absolute} · ${formatted.relative}`;
            }
            break;
          }
        }
      }

      return {
        label: `${i.label}: ${i.percent_left.toFixed(0)}% ${t('left')}`,
        description,
      };
    });

    vscode.window.showQuickPick(picks, { placeHolder: t('Kimi API Usage Details') });
  } catch (err) {
    vscode.window.showErrorMessage(t('Kimi usage fetch failed: {0}', String(err)));
  }
}
```

> Note: The absolute reset time lookup from raw payload is a best-effort fallback. If the mapping is imprecise, the description still shows the numeric ratio.

- [ ] **Step 2: Commit**

```bash
git add vscode-extension/src/extension.ts
git commit -m "$(cat <<'EOF'
feat: show absolute reset time in QuickPick details

showDetails() 弹窗新增绝对重置时间：
"周四 04:23 重置 · 剩 5d 3h" / "Resets Thu 04:23 · 5d 3h left"

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Simplify Chinese shortLabel

**Files:**
- Modify: `vscode-extension/src/extension.ts:335-349`

- [ ] **Step 1: Update shortLabel() for Chinese mode**

Replace `shortLabel()`:

```typescript
function shortLabel(label: string): string {
  const lower = label.toLowerCase();
  const isZh = translator.t('left') === '剩余';

  if (lower.includes('weekly') || lower.includes('week') || lower.includes('周')) {
    return isZh ? '周' : 'W';
  }
  if (lower.includes('5h') || lower.includes('5 hour') || lower.includes('5小时')) {
    return isZh ? '5时' : '5H';
  }
  if (lower.includes('month') || lower.includes('monthly') || lower.includes('月')) {
    return isZh ? '月' : 'M';
  }
  return label.slice(0, 3);
}
```

- [ ] **Step 2: Commit**

```bash
git add vscode-extension/src/extension.ts
git commit -m "$(cat <<'EOF'
refactor: simplify Chinese status bar labels

中文模式标签精简：
- "周限额:42%" → "周:42%"
- "5小时:99%" → "5时:99%"

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Add package.json Configuration

**Files:**
- Modify: `vscode-extension/package.json:41-45` (after refreshIntervalMinutes)

- [ ] **Step 1: Add showPaceIndicator setting**

Insert after `kimiCodeUsage.refreshIntervalMinutes`:

```json
        "kimiCodeUsage.showPaceIndicator": {
          "type": "boolean",
          "default": true,
          "description": "Show pace indicator (Warp/Impulse/Moonwalk) / 显示速度指针（曲率/脉冲/月球漫步）"
        },
```

- [ ] **Step 2: Commit**

```bash
git add vscode-extension/package.json
git commit -m "$(cat <<'EOF'
feat: add showPaceIndicator configuration toggle

新增设置项 kimiCodeUsage.showPaceIndicator，
默认开启，可随时关闭速度指针显示。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Add l10n Strings

**Files:**
- Modify: `vscode-extension/l10n/bundle.l10n.zh-cn.json` (create if missing)
- Modify: `vscode-extension/l10n/bundle.l10n.json` (create if missing)

- [ ] **Step 1: Create or update English l10n bundle**

Check if `vscode-extension/l10n/bundle.l10n.json` exists. If not, create it:

```json
{
  "Warp": "Warp",
  "Impulse": "Impulse",
  "Moonwalk": "Moonwalk",
  "Expected": "Expected",
  "Actual": "Actual",
  "Pace {0}x — {1}": "Pace {0}x — {1}"
}
```

If it exists, merge these keys into the existing JSON.

- [ ] **Step 2: Create or update Chinese l10n bundle**

Check if `vscode-extension/l10n/bundle.l10n.zh-cn.json` exists. If not, create it:

```json
{
  "Warp": "曲率加速",
  "Impulse": "脉冲推进",
  "Moonwalk": "月球漫步",
  "Expected": "应耗",
  "Actual": "实耗",
  "Pace {0}x — {1}": "速度比 {0}x — {1}"
}
```

If it exists, merge these keys.

- [ ] **Step 3: Commit**

```bash
git add vscode-extension/l10n/
git commit -m "$(cat <<'EOF'
feat: add pace indicator i18n strings

新增 Warp/Impulse/Moonwalk、Expected/Actual 等国际化键值，
支持中英双语切换。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Local Testing

**Files:**
- Test via VS Code: Extension Development Host

- [ ] **Step 1: Compile the extension**

```bash
cd /Users/hainingyu/Code/kimi_usage/vscode-extension
npm run compile
```

Expected: `tsc` compiles without errors. Check for `out/extension.js`.

- [ ] **Step 2: Launch Extension Development Host**

In VS Code: (not the terminal), open `vscode-extension/` folder, then:

Press `F5` or Run → "Start Debugging" → select "VS Code: Extension Development".

A new VS Code: window opens with the extension loaded.

- [ ] **Step 3: Verify normal state (with API key)**

Set `KIMI_API_KEY` in `.env` or VS Code: settings.

Check status bar shows:
```
🌒 Kimi Warp ▰▰▰▰▱ 1.4x W:42% 5H:99%
```
(or equivalent based on actual usage)

Hover over status bar → verify tooltip shows pace line with Expected/Actual.

Click status bar → verify QuickPick shows absolute reset time.

- [ ] **Step 4: Verify disabled state**

Open VS Code: settings → search "showPaceIndicator" → uncheck.

Status bar should revert to pre-feature format:
```
⧡ Kimi W:42% 5H:99%
```

- [ ] **Step 5: Verify error states**

Temporarily remove API key → status bar shows `$(warning) Kimi: no key`.

Disconnect network → status bar shows `$(sync~spin) Kimi: err`.

- [ ] **Step 6: Commit (mark testing complete)**

No code changes in this task. Optionally record test results in a note.

---

## Self-Review Checklist

| Spec Requirement | Implementing Task |
|---|---|
| Three-state model (Warp/Impulse/Moonwalk) | Task 2 (computePace) |
| Strict thresholds 0.9x–1.1x | Task 2 (computePace) |
| ASCII bar ▰▰▰▱▱ with 5 fill levels | Task 2 (formatPaceBar) |
| Moon phases 🌒🌓🌔 | Task 3 (refresh prefix) |
| Pace indicator before W:xx% | Task 3 (status bar text assembly) |
| Absolute reset time in hover/QuickPick | Task 2 (formatResetTimeAbsolute), Task 4 |
| Background color unchanged by pace | Task 3 (no pace logic in bg color block) |
| Only weekly gets pace | Task 3 (weeklyItem find) |
| showPaceIndicator toggle | Task 6 |
| Simplified Chinese labels | Task 5 |
| Local testing only, no packaging | Task 8 |

**Placeholder scan:** No TBD/TODO/"implement later" found. All steps contain complete code. ✓

**Type consistency:** `UsageItem` extended once in Task 1; all downstream tasks use the same shape. `PaceState` defined in Task 2; used in Task 3. ✓
