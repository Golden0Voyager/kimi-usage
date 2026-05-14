# Pace 主题与自定义阈值设计文档

## 背景与目标

当前 `computePace` 函数中的 warp / moonwalk 分界阈值（`1.1` 和 `0.9`）为硬编码，用户无法调整。同时，pace 状态的标签和图标仅支持单一自定义，缺乏趣味性和场景化表达。

本设计旨在：
1. 让用户可自定义 warp / moonwalk 的分界阈值。
2. 提供多组「主题预设」，一键切换标签风格（动物、赛车、鱼类、鸟类、火箭、跑步、星球大战、星际迷航、回到未来）。
3. 保留现有独立自定义能力（`paceLabels`、`paceIcons`），实现「预设打底 + 独立覆盖」的灵活配置。

## 配置结构（package.json）

新增三项配置：

### `kimiCodeUsage.paceTheme`

- **类型**: `string`
- **枚举**: `["default", "animals", "racing", "fish", "birds", "rocket", "running", "starWars", "starTrek", "backToTheFuture"]`
- **默认值**: `"default"`
- **说明**: 选择 pace 标签的主题风格族。

### `kimiCodeUsage.paceSensitivity`

- **类型**: `string`
- **枚举**: `["relaxed", "normal", "strict"]`
- **默认值**: `"normal"`
- **说明**: 选择阈值灵敏度档位。
  - `relaxed`：宽松，极端情况才切换状态。
  - `normal`：与当前硬编码一致。
  - `strict`：敏感，轻微波动即切换状态。

### `kimiCodeUsage.paceThresholds`

- **类型**: `object`
- **默认值**: `{}`（空对象）
- **说明**: 高级用户可直接覆盖两个分界阈值，单位均为 pace ratio。若某项未填写，则自动采用 `paceSensitivity` 档位对应的预设值。
- **属性**:
  - `warp` (`number`, 可选): 进入 warp 状态的 ratio 下限。
  - `moonwalk` (`number`, 可选): 进入 moonwalk 状态的 ratio 上限。

现有配置 `kimiCodeUsage.paceLabels` 和 `kimiCodeUsage.paceIcons` 继续保留，作为最优先的独立覆盖项。

## 主题预设定义

每个主题族定义三个状态的本地化标签 key。图标全局固定，不随主题变化。

| 主题族 | Warp Key | Impulse Key | Moonwalk Key |
|---|---|---|---|
| `default` | `Warp` | `Impulse` | `Moonwalk` |
| `animals` | `Cheetah` | `Lynx` | `Sloth` |
| `racing` | `Nitro` | `Cruise` | `Idle` |
| `fish` | `Marlin` | `Dolphin` | `Turtle` |
| `birds` | `Peregrine` | `Eagle` | `Ostrich` |
| `rocket` | `Thrust` | `Propulsion` | `Hover` |
| `running` | `Sprint` | `Jog` | `Moonwalk` |
| `starWars` | `Falcon` | `X-Wing` | `Shuttle` |
| `starTrek` | `Defiant` | `Enterprise` | `Shuttle` |
| `backToTheFuture` | `Flux` | `Driving` | `Parked` |

图标固定映射（不随主题变化）：
- Warp: `warning`
- Impulse: `dashboard`
- Moonwalk: `coffee`

## 阈值与灵敏度映射

| 档位 | warp 阈值 | moonwalk 阈值 |
|---|---|---|
| `relaxed` | `1.3` | `0.7` |
| `normal` | `1.1` | `0.9` |
| `strict` | `1.05` | `0.95` |

## 本地化方案

所有主题标签 key 均纳入现有 `Translator` / l10n bundle 系统：

- `l10n/bundle.l10n.json`（英文）：键值同名，如 `"Sloth": "Sloth"`。
- `l10n/bundle.l10n.zh-cn.json`（中文）：提供对应翻译，如 `"Sloth": "树懒"`。

代码中通过 `t('Snow Leopard')` 获取本地化后的展示文本。

## 配置优先级（从高到低）

1. **独立覆盖项**：用户若显式设置了 `paceLabels` / `paceIcons` / `paceThresholds`，则对应项以此为准。
2. **主题 + 灵敏度预设**：未独立覆盖的项，按当前选中的 `paceTheme` 和 `paceSensitivity` 自动填充。
3. **硬编码默认值**：兜底。

## 实现范围

### 修改文件

- `package.json`：新增三项 `contributes.configuration` 定义。
- `src/extension.ts`：
  - 新增 `PaceThemePreset` / `SensitivityPreset` 类型与常量表。
  - 新增 `getThemeLabelKey(theme, state)` 函数，根据主题族和状态返回本地化 key。
  - 新增 `readPaceThresholds(cfg)` 函数，综合 `paceSensitivity` 和 `paceThresholds` 独立覆盖读取最终阈值。
  - 修改 `getPacePresentation()`：标签解析逻辑优先查 `paceLabels`，其次按 `paceTheme` 查预设 key，最后兜底默认 key。
  - 修改 `computePace()`：接收阈值参数，替代硬编码的 `1.1` / `0.9`。
- `l10n/bundle.l10n.json`：新增所有主题标签 key。
- `l10n/bundle.l10n.zh-cn.json`：新增所有主题标签 key 的中文翻译。

### 不修改的内容

- 状态栏渲染逻辑、tooltip 构建、`showDetails` QuickPick 等外围展示逻辑不变。
- 现有 `paceLabels` / `paceIcons` 的独立自定义能力完全保留，向后兼容。
