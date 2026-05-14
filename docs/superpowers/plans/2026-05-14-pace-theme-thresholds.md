# Pace 主题与自定义阈值 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `paceTheme`、`paceSensitivity`、`paceThresholds` 三项配置，实现 10 组主题预设 + 3 档灵敏度阈值 + 独立阈值覆盖，所有标签走现有 l10n 本地化系统。

**Architecture:** 在 `extension.ts` 中新增 `THEME_LABELS` 常量表（主题 → 状态 → l10n key）和 `SENSITIVITY_THRESHOLDS` 常量表（档位 → 阈值）。`getPacePresentation()` 在 `paceLabels` 独立覆盖之后增加主题预设查询；`computePace()` 改为接收 `ThresholdConfig` 参数；`refresh()` 中通过 `readPaceThresholds()` 组合灵敏度预设与独立覆盖。

**Tech Stack:** TypeScript, VS Code Extension API, l10n bundle

---

## File Mapping

| File | Responsibility |
|---|---|
| `vscode-extension/package.json` | 新增 `paceTheme`、`paceSensitivity`、`paceThresholds` 配置定义 |
| `vscode-extension/l10n/bundle.l10n.json` | 新增 22 个主题标签 key 的英文映射（键值同名） |
| `vscode-extension/l10n/bundle.l10n.zh-cn.json` | 新增 22 个主题标签 key 的中文翻译 |
| `vscode-extension/src/extension.ts` | 核心逻辑：常量表、配置读取、标签解析、阈值计算 |

---

### Task 1: package.json — 新增配置项

**Files:**
- Modify: `vscode-extension/package.json:27-129`

**Context:** 在现有 `contributes.configuration.properties` 中 `paceIcons` 之后插入 3 个新配置项。

- [ ] **Step 1: 插入 `paceTheme` 配置**

在 `paceIcons` 配置项（order 9）之后插入：

```json
"kimiCodeUsage.paceTheme": {
  "type": "string",
  "default": "default",
  "enum": ["default", "animals", "racing", "fish", "birds", "rocket", "running", "starWars", "starTrek", "backToTheFuture"],
  "description": "Pace label theme preset / 速度指针主题预设",
  "order": 10
},
"kimiCodeUsage.paceSensitivity": {
  "type": "string",
  "default": "normal",
  "enum": ["relaxed", "normal", "strict"],
  "description": "Pace threshold sensitivity / 阈值灵敏度档位",
  "order": 11
},
"kimiCodeUsage.paceThresholds": {
  "type": "object",
  "default": {},
  "description": "Advanced: override pace thresholds (warp/moonwalk). Empty fields fall back to sensitivity preset / 高级：覆盖速度分界阈值，留空则回退到灵敏度预设",
  "order": 12,
  "properties": {
    "warp": {
      "type": "number",
      "description": "Ratio threshold to enter warp state / 进入 warp 状态的 ratio 下限"
    },
    "moonwalk": {
      "type": "number",
      "description": "Ratio threshold to enter moonwalk state / 进入 moonwalk 状态的 ratio 上限"
    }
  }
}
```

- [ ] **Step 2: 重新编号后续 order**

确认插入后 `paceTheme` order=10、`paceSensitivity` order=11、`paceThresholds` order=12。原有配置 order 无需调整（它们 < 10）。

- [ ] **Step 3: Commit**

```bash
cd /Users/hainingyu/Code/kimi_usage/vscode-extension
git add package.json
git commit -m "feat(config): add paceTheme, paceSensitivity, paceThresholds settings

新增 pace 主题预设、灵敏度档位、阈值覆盖三项配置。"
```

---

### Task 2: 英文 l10n — 新增主题标签 key

**Files:**
- Modify: `vscode-extension/l10n/bundle.l10n.json`

**Context:** 在现有键之后追加所有新主题标签。键值同名（英文显示与 key 一致）。

- [ ] **Step 1: 追加新键值对**

在文件末尾 `}` 之前插入（注意前一条末尾加逗号）：

```json
  "Cheetah": "Cheetah",
  "Lynx": "Lynx",
  "Sloth": "Sloth",
  "Nitro": "Nitro",
  "Cruise": "Cruise",
  "Idle": "Idle",
  "Marlin": "Marlin",
  "Dolphin": "Dolphin",
  "Turtle": "Turtle",
  "Peregrine": "Peregrine",
  "Eagle": "Eagle",
  "Ostrich": "Ostrich",
  "Thrust": "Thrust",
  "Propulsion": "Propulsion",
  "Hover": "Hover",
  "Sprint": "Sprint",
  "Jog": "Jog",
  "Falcon": "Falcon",
  "X-Wing": "X-Wing",
  "Shuttle": "Shuttle",
  "Defiant": "Defiant",
  "Enterprise": "Enterprise",
  "Flux": "Flux",
  "Driving": "Driving",
  "Parked": "Parked"
```

注意：原有 `"Ground Control to Major Kimi!"` 那条末尾需要加上逗号。

- [ ] **Step 2: Commit**

```bash
cd /Users/hainingyu/Code/kimi_usage/vscode-extension
git add l10n/bundle.l10n.json
git commit -m "feat(l10n): add English labels for all pace themes

为 10 个主题族的所有状态标签新增英文 l10n key。"
```

---

### Task 3: 中文 l10n — 新增主题标签翻译

**Files:**
- Modify: `vscode-extension/l10n/bundle.l10n.zh-cn.json`

**Context:** 与英文 bundle 结构完全一致，提供中文翻译。

- [ ] **Step 1: 追加中文翻译**

在文件末尾 `}` 之前插入：

```json
  "Cheetah": "猎豹",
  "Lynx": "山猫",
  "Sloth": "树懒",
  "Nitro": "氮气",
  "Cruise": "巡航",
  "Idle": "怠速",
  "Marlin": "旗鱼",
  "Dolphin": "海豚",
  "Turtle": "海龟",
  "Peregrine": "游隼",
  "Eagle": "鹰",
  "Ostrich": "鸵鸟",
  "Thrust": "推力",
  "Propulsion": "常规推进",
  "Hover": "悬停待机",
  "Sprint": "冲刺",
  "Jog": "慢跑",
  "Falcon": "千年隼",
  "X-Wing": "X翼战机",
  "Shuttle": "穿梭机",
  "Defiant": "挑战号",
  "Enterprise": "企业号",
  "Flux": "通量加速",
  "Driving": "行驶中",
  "Parked": "停车熄火"
```

- [ ] **Step 2: Commit**

```bash
cd /Users/hainingyu/Code/kimi_usage/vscode-extension
git add l10n/bundle.l10n.zh-cn.json
git commit -m "feat(l10n): add Chinese translations for all pace themes

为 10 个主题族的所有状态标签新增中文翻译。"
```

---

### Task 4: extension.ts — 核心逻辑实现

**Files:**
- Modify: `vscode-extension/src/extension.ts`

**Context:** 这是最大的修改。涉及：新增类型/常量、新增配置读取函数、修改 `computePace` 签名、修改 `getPacePresentation` 标签解析逻辑、修改 `refresh` 和 `showDetails` 中的调用点。

- [ ] **Step 1: 新增类型与常量表**

在 `extension.ts` 中 `ICON_NAME_PATTERN` 之后（约第 41 行后）插入：

```typescript
type PaceTheme = 'default' | 'animals' | 'racing' | 'fish' | 'birds' | 'rocket' | 'running' | 'starWars' | 'starTrek' | 'backToTheFuture';
type PaceSensitivity = 'relaxed' | 'normal' | 'strict';

interface ThresholdConfig {
  warp: number;
  moonwalk: number;
}

const THEME_LABELS: Record<PaceTheme, Record<'warp' | 'impulse' | 'moonwalk', string>> = {
  default: { warp: 'Warp', impulse: 'Impulse', moonwalk: 'Moonwalk' },
  animals: { warp: 'Cheetah', impulse: 'Lynx', moonwalk: 'Sloth' },
  racing: { warp: 'Nitro', impulse: 'Cruise', moonwalk: 'Idle' },
  fish: { warp: 'Marlin', impulse: 'Dolphin', moonwalk: 'Turtle' },
  birds: { warp: 'Peregrine', impulse: 'Eagle', moonwalk: 'Ostrich' },
  rocket: { warp: 'Thrust', impulse: 'Propulsion', moonwalk: 'Hover' },
  running: { warp: 'Sprint', impulse: 'Jog', moonwalk: 'Moonwalk' },
  starWars: { warp: 'Falcon', impulse: 'X-Wing', moonwalk: 'Shuttle' },
  starTrek: { warp: 'Defiant', impulse: 'Enterprise', moonwalk: 'Shuttle' },
  backToTheFuture: { warp: 'Flux', impulse: 'Driving', moonwalk: 'Parked' },
};

const SENSITIVITY_THRESHOLDS: Record<PaceSensitivity, ThresholdConfig> = {
  relaxed: { warp: 1.3, moonwalk: 0.7 },
  normal: { warp: 1.1, moonwalk: 0.9 },
  strict: { warp: 1.05, moonwalk: 0.95 },
};
```

- [ ] **Step 2: 修改 `computePace` 接收阈值参数**

将原函数（约第 67-86 行）：

```typescript
function computePace(item: UsageItem, windowSeconds: number): PaceState | null {
```

改为：

```typescript
function computePace(item: UsageItem, windowSeconds: number, thresholds: ThresholdConfig): PaceState | null {
```

并将内部判断：

```typescript
  let state: 'warp' | 'impulse' | 'moonwalk';
  if (ratio >= 1.1) state = 'warp';
  else if (ratio <= 0.9) state = 'moonwalk';
  else state = 'impulse';
```

改为：

```typescript
  let state: 'warp' | 'impulse' | 'moonwalk';
  if (ratio >= thresholds.warp) state = 'warp';
  else if (ratio <= thresholds.moonwalk) state = 'moonwalk';
  else state = 'impulse';
```

- [ ] **Step 3: 修改 `formatPaceBar` 接收阈值参数**

原函数（约第 103-109 行）：

```typescript
function formatPaceBar(ratio: number): string {
  let filled: number;
  if (ratio >= 1.1) filled = 3;
  else if (ratio >= 0.9) filled = 2;
  else filled = 1;
  return '▰'.repeat(filled) + '▱'.repeat(3 - filled);
}
```

改为：

```typescript
function formatPaceBar(ratio: number, thresholds: ThresholdConfig): string {
  let filled: number;
  if (ratio >= thresholds.warp) filled = 3;
  else if (ratio >= thresholds.moonwalk) filled = 2;
  else filled = 1;
  return '▰'.repeat(filled) + '▱'.repeat(3 - filled);
}
```

- [ ] **Step 4: 新增 `readPaceThresholds` 函数**

在 `readThresholdSettings` 函数之后（约第 209 行后）插入：

```typescript
function readPaceThresholds(cfg: vscode.WorkspaceConfiguration): ThresholdConfig {
  const sensitivity = cfg.get<PaceSensitivity>('paceSensitivity', 'normal');
  const preset = SENSITIVITY_THRESHOLDS[sensitivity] ?? SENSITIVITY_THRESHOLDS.normal;

  const custom = cfg.get<Partial<ThresholdConfig>>('paceThresholds', {});

  return {
    warp: Number.isFinite(custom.warp) ? custom.warp! : preset.warp,
    moonwalk: Number.isFinite(custom.moonwalk) ? custom.moonwalk! : preset.moonwalk,
  };
}
```

- [ ] **Step 5: 修改 `getPacePresentation` 增加主题预设查询**

将原函数（约第 223-239 行）：

```typescript
function getPacePresentation(cfg: vscode.WorkspaceConfiguration, state: PaceState['state']): PacePresentation {
  const config = PACE_CONFIG[state];
  const defaultLabel = t(config.labelKey);
  const labelObject = cfg.get<Record<string, string>>('paceLabels', {});
  const fromObject = typeof labelObject?.[state] === 'string' ? labelObject[state] : '';
  const fromLegacy = cfg.get<string>(config.labelSetting, '');
  const configuredLabel = (fromObject || fromLegacy || defaultLabel).trim();
  const label = configuredLabel || defaultLabel;

  const iconObject = cfg.get<Record<string, string>>('paceIcons', {});
  const iconFromObject = typeof iconObject?.[state] === 'string' ? iconObject[state] : '';
  const iconFromLegacy = cfg.get<string>(config.iconSetting, '');
  const configuredIcon = iconFromObject || iconFromLegacy || config.defaultIcon;
  const icon = normalizeIconName(configuredIcon, config.defaultIcon);

  return { label, icon };
}
```

改为：

```typescript
function getPacePresentation(cfg: vscode.WorkspaceConfiguration, state: PaceState['state']): PacePresentation {
  const config = PACE_CONFIG[state];
  const defaultLabel = t(config.labelKey);

  // 1. 独立覆盖（最高优先级）
  const labelObject = cfg.get<Record<string, string>>('paceLabels', {});
  const fromObject = typeof labelObject?.[state] === 'string' ? labelObject[state] : '';
  const fromLegacy = cfg.get<string>(config.labelSetting, '');

  // 2. 主题预设
  const theme = cfg.get<PaceTheme>('paceTheme', 'default');
  const themeKey = (THEME_LABELS[theme] ?? THEME_LABELS.default)[state];
  const themeLabel = t(themeKey);

  const configuredLabel = (fromObject || fromLegacy || themeLabel).trim();
  const label = configuredLabel || defaultLabel;

  // 图标逻辑不变
  const iconObject = cfg.get<Record<string, string>>('paceIcons', {});
  const iconFromObject = typeof iconObject?.[state] === 'string' ? iconObject[state] : '';
  const iconFromLegacy = cfg.get<string>(config.iconSetting, '');
  const configuredIcon = iconFromObject || iconFromLegacy || config.defaultIcon;
  const icon = normalizeIconName(configuredIcon, config.defaultIcon);

  return { label, icon };
}
```

- [ ] **Step 6: 修改 `refresh` 函数中的阈值读取与传递**

在 `refresh()` 函数中（约第 381-492 行），找到：

```typescript
  const thresholds = readThresholdSettings(cfg);
```

在其后插入：

```typescript
  const paceThresholds = readPaceThresholds(cfg);
```

然后找到：

```typescript
    const pace = weeklyItem && showPace ? computePace(weeklyItem, getWindowSeconds(weeklyItem.label)) : null;
```

改为：

```typescript
    const pace = weeklyItem && showPace ? computePace(weeklyItem, getWindowSeconds(weeklyItem.label), paceThresholds) : null;
```

再找到：

```typescript
    const paceBar = pace ? formatPaceBar(pace.ratio) : '▰▰▱';
```

改为：

```typescript
    const paceBar = pace ? formatPaceBar(pace.ratio, paceThresholds) : '▰▰▱';
```

再找到 `showDetails` 调用内部（约第 465-466 行）的循环：

```typescript
        const itemPace = computePace(item, getWindowSeconds(item.label));
```

改为：

```typescript
        const itemPace = computePace(item, getWindowSeconds(item.label), paceThresholds);
```

- [ ] **Step 7: 修改 `showDetails` 函数中的阈值读取与传递**

在 `showDetails()` 函数中（约第 746-816 行），找到 `showPace` 的定义处，在其前插入：

```typescript
  const paceThresholds = readPaceThresholds(cfg);
```

然后找到循环中的：

```typescript
        const pace = computePace(item, getWindowSeconds(item.label));
```

改为：

```typescript
        const pace = computePace(item, getWindowSeconds(item.label), paceThresholds);
```

- [ ] **Step 8: Commit**

```bash
cd /Users/hainingyu/Code/kimi_usage/vscode-extension
git add src/extension.ts
git commit -m "feat(pace): implement theme presets and custom thresholds

实现 10 组 pace 主题预设、3 档灵敏度阈值、独立阈值覆盖。
- 新增 THEME_LABELS / SENSITIVITY_THRESHOLDS 常量表
- computePace / formatPaceBar 接收阈值参数
- getPacePresentation 增加主题预设查询逻辑
- refresh / showDetails 读取并传递阈值配置"
```

---

### Task 5: 编译验证

**Files:**
- 验证: `vscode-extension/src/extension.ts`

- [ ] **Step 1: 运行 TypeScript 编译**

```bash
cd /Users/hainingyu/Code/kimi_usage/vscode-extension
npx tsc -p ./
```

**Expected:** 无错误输出，退出码 0。

- [ ] **Step 2: Commit**

如果编译通过无需修改代码，此 task 不产生新 commit（因为没有文件变更）。如果编译失败，修复后按文件单独 commit。

---

## Self-Review

### Spec Coverage

| Spec 要求 | 对应 Task |
|---|---|
| `paceTheme` 枚举 10 个主题族 | Task 1 |
| `paceSensitivity` 3 档枚举 | Task 1 |
| `paceThresholds` object 配置 | Task 1 |
| 动物主题标签（Cheetah/Lynx/Sloth） | Task 2, 3, 4 |
| 赛车主题标签 | Task 2, 3, 4 |
| 鱼类主题标签 | Task 2, 3, 4 |
| 鸟类主题标签 | Task 2, 3, 4 |
| 火箭主题标签 | Task 2, 3, 4 |
| 跑步主题标签（Sprint/Jog/Moonwalk） | Task 2, 3, 4 |
| 星战飞船标签（Falcon/X-Wing/Shuttle） | Task 2, 3, 4 |
| 星际迷航飞船标签（Defiant/Enterprise/Shuttle） | Task 2, 3, 4 |
| 回到未来标签 | Task 2, 3, 4 |
| 阈值映射（relaxed/normal/strict） | Task 4 |
| 配置优先级（独立覆盖 > 主题预设 > 默认） | Task 4 Step 5 |
| 图标固定不随主题变化 | 未修改图标逻辑，保持现状 |
| l10n 本地化 | Task 2, 3 |
| `paceLabels` / `paceIcons` 向后兼容 | Task 4 Step 5 |

**Gap:** 无。

### Placeholder Scan

- 无 TBD / TODO / "implement later"。
- 无 "appropriate error handling" 等模糊描述。
- 每个 step 均含具体代码或命令。

### Type Consistency

- `ThresholdConfig` 在 Task 4 Step 1 定义，`computePace` Step 2、`formatPaceBar` Step 3、`readPaceThresholds` Step 4、`refresh` Step 6 中均使用同一接口。
- `PaceTheme` 枚举与 `THEME_LABELS` keys 完全一致。
- `PaceSensitivity` 枚举与 `SENSITIVITY_THRESHOLDS` keys 完全一致。
