import * as vscode from 'vscode';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

interface UsageItem {
  label: string;
  used: number;
  limit: number;
  remaining: number;
  percent_left: number;
  reset_hint: string | null;
  reset_seconds: number | null;
  reset_at: string | null;
}

interface PaceState {
  ratio: number;
  state: 'warp' | 'impulse' | 'moonwalk';
}

interface PacePresentation {
  label: string;
  icon: string;
}

interface ThresholdSettings {
  weekly: number;
  fiveHours: number;
}

interface ErrorPresentation {
  text: string;
  tooltip: string;
  isWarning: boolean;
}

const WEEKLY_WINDOW_SECONDS = 7 * 24 * 3600;
const MIN_REFRESH_MINUTES = 1;
const DEFAULT_LOW_THRESHOLD = 30;
const ICON_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

type LanguageChoice = 'Auto' | 'English' | 'Chinese';
type WindowType = 'weekly' | 'fiveHours' | 'monthly' | 'other';

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
  relaxed: { warp: 1.2, moonwalk: 0.8 },
  normal: { warp: 1.1, moonwalk: 0.9 },
  strict: { warp: 1.05, moonwalk: 0.95 },
};

const PACE_CONFIG = {
  warp: {
    labelKey: 'Warp',
    labelSetting: 'paceLabels.overload',
    iconSetting: 'paceIcons.overload',
    defaultIcon: 'warning',
  },
  impulse: {
    labelKey: 'Impulse',
    labelSetting: 'paceLabels.impulse',
    iconSetting: 'paceIcons.impulse',
    defaultIcon: 'dashboard',
  },
  moonwalk: {
    labelKey: 'Moonwalk',
    labelSetting: 'paceLabels.moonwalk',
    iconSetting: 'paceIcons.moonwalk',
    defaultIcon: 'coffee',
  },
} as const;

function computePace(item: UsageItem, windowSeconds: number, thresholds: ThresholdConfig): PaceState | null {
  if (!item.reset_seconds || item.reset_seconds <= 0) return null;
  if (item.limit <= 0) return null;

  const elapsed = windowSeconds - item.reset_seconds;
  if (elapsed <= 0 || elapsed < 3600) return null;

  const actualUsedRatio = item.used / item.limit;
  const elapsedRatio = elapsed / windowSeconds;

  const rawRatio = elapsedRatio > 0 ? actualUsedRatio / elapsedRatio : 0;
  const ratio = Math.min(rawRatio, 5.0);

  let state: 'warp' | 'impulse' | 'moonwalk';
  if (ratio >= thresholds.warp) state = 'warp';
  else if (ratio <= thresholds.moonwalk) state = 'moonwalk';
  else state = 'impulse';

  return { ratio, state };
}

function detectWindowType(label: string): WindowType {
  const lower = label.toLowerCase();
  if (lower.includes('weekly') || lower.includes('week') || lower.includes('周')) return 'weekly';
  if (lower.includes('5h') || lower.includes('5 hour') || lower.includes('5小时')) return 'fiveHours';
  if (lower.includes('month') || lower.includes('monthly') || lower.includes('月')) return 'monthly';
  return 'other';
}

function getWindowSeconds(label: string): number {
  const windowType = detectWindowType(label);
  if (windowType === 'fiveHours') return 5 * 3600;
  if (windowType === 'monthly') return 30 * 24 * 3600;
  return WEEKLY_WINDOW_SECONDS;
}

function formatPaceBar(ratio: number, thresholds: ThresholdConfig): string {
  let filled: number;
  if (ratio >= thresholds.warp) filled = 3;
  else if (ratio >= thresholds.moonwalk) filled = 2;
  else filled = 1;
  return '▰'.repeat(filled) + '▱'.repeat(3 - filled);
}

let statusBarItem: vscode.StatusBarItem;
let intervalId: NodeJS.Timeout | undefined;
let translator: Translator;

class Translator {
  private bundle: Record<string, string> = {};
  private useNative = true;
  private languageChoice: LanguageChoice = 'Auto';

  constructor(context: vscode.ExtensionContext) {
    this.update(context);
  }

  update(context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration('kimiCodeUsage');
    const lang = config.get<LanguageChoice>('language', 'Auto');
    this.languageChoice = lang;

    if (lang === 'Auto') {
      this.useNative = true;
      this.bundle = {};
      return;
    }

    this.useNative = false;
    const fileName = lang === 'Chinese' ? 'bundle.l10n.zh-cn.json' : 'bundle.l10n.json';
    const filePath = path.join(context.extensionPath, 'l10n', fileName);
    try {
      if (fs.existsSync(filePath)) {
        this.bundle = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } else {
        this.bundle = {};
      }
    } catch (e) {
      console.error('Failed to load l10n bundle', e);
      this.useNative = true;
      this.bundle = {};
    }
  }

  t(message: string, ...args: unknown[]): string {
    let str = this.useNative ? vscode.l10n.t(message) : (this.bundle[message] || message);
    if (args.length > 0) {
      args.forEach((arg, i) => {
        str = str.replace(`{${i}}`, String(arg));
      });
    }
    return str;
  }

  isZh(): boolean {
    if (this.languageChoice === 'Chinese') return true;
    if (this.languageChoice === 'English') return false;
    return vscode.env.language.toLowerCase().startsWith('zh');
  }
}

export function activate(context: vscode.ExtensionContext) {
  translator = new Translator(context);

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'kimiCodeUsage.showDetails';
  statusBarItem.show();

  const refreshCmd = vscode.commands.registerCommand('kimiCodeUsage.refresh', refresh);
  const detailsCmd = vscode.commands.registerCommand('kimiCodeUsage.showDetails', showDetails);

  const configChangeDisposable = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('kimiCodeUsage')) {
      if (e.affectsConfiguration('kimiCodeUsage.language')) {
        translator.update(context);
      }
      restartInterval();
      refresh();
    }
  });

  context.subscriptions.push(statusBarItem, refreshCmd, detailsCmd, configChangeDisposable);

  refresh();
  restartInterval();
}

function t(message: string, ...args: unknown[]): string {
  return translator.t(message, ...args);
}

function sanitizePercentThreshold(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  const numeric = value as number;
  return Math.max(0, Math.min(100, numeric));
}

function readThresholdSettings(cfg: vscode.WorkspaceConfiguration): ThresholdSettings {
  return {
    weekly: sanitizePercentThreshold(cfg.get<number>('weeklyLowThresholdPercent', DEFAULT_LOW_THRESHOLD), DEFAULT_LOW_THRESHOLD),
    fiveHours: sanitizePercentThreshold(cfg.get<number>('fiveHourLowThresholdPercent', DEFAULT_LOW_THRESHOLD), DEFAULT_LOW_THRESHOLD),
  };
}

function readPaceThresholds(cfg: vscode.WorkspaceConfiguration): ThresholdConfig {
  const sensitivity = cfg.get<PaceSensitivity>('paceSensitivity', 'normal');
  const preset = SENSITIVITY_THRESHOLDS[sensitivity] ?? SENSITIVITY_THRESHOLDS.normal;

  const custom = cfg.get<Partial<ThresholdConfig>>('paceThresholds', {});

  return {
    warp: Number.isFinite(custom.warp) ? custom.warp! : preset.warp,
    moonwalk: Number.isFinite(custom.moonwalk) ? custom.moonwalk! : preset.moonwalk,
  };
}

function normalizeIconName(raw: string, fallback: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return fallback;

  let name = trimmed;
  if (name.startsWith('$(') && name.endsWith(')')) {
    name = name.slice(2, -1).trim();
  }

  return ICON_NAME_PATTERN.test(name) ? name : fallback;
}

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

function restartInterval() {
  if (intervalId) clearInterval(intervalId);

  const cfg = vscode.workspace.getConfiguration('kimiCodeUsage');
  const configured = cfg.get<number>('refreshIntervalMinutes', 5);
  const safeMinutes = Number.isFinite(configured) ? Math.max(MIN_REFRESH_MINUTES, configured) : 5;
  intervalId = setInterval(refresh, safeMinutes * 60 * 1000);
}

export function deactivate() {
  if (intervalId) clearInterval(intervalId);
}

async function resolveApiKey(): Promise<string> {
  const cfg = vscode.workspace.getConfiguration('kimiCodeUsage');
  const configuredKey = cfg.get<string>('apiKey', '');
  if (configuredKey) return configuredKey;

  if (vscode.workspace.workspaceFolders) {
    for (const folder of vscode.workspace.workspaceFolders) {
      const envPath = vscode.Uri.joinPath(folder.uri, '.env');
      try {
        const envData = await vscode.workspace.fs.readFile(envPath);
        const envText = Buffer.from(envData).toString('utf8');
        const lines = envText.split('\n');
        let fallbackKey = '';
        for (const line of lines) {
          const match = line.match(/^\s*(KIMI_CODING_API_KEY|KIMI_API_KEY)\s*=\s*['"]?([^'"\s]+)['"]?/);
          if (match) {
            if (match[1] === 'KIMI_CODING_API_KEY') return match[2];
            if (!fallbackKey) fallbackKey = match[2];
          }
        }
        if (fallbackKey) return fallbackKey;
      } catch {
        // Continue when .env is absent or unreadable.
      }
    }
  }

  if (process.env.KIMI_CODING_API_KEY) return process.env.KIMI_CODING_API_KEY;
  if (process.env.KIMI_API_KEY) return process.env.KIMI_API_KEY;
  return '';
}

function localizedLimitName(label: string): string {
  const type = detectWindowType(label);
  const isZh = translator.isZh();

  if (type === 'weekly') return isZh ? t('Every Week') : t('Weekly');
  if (type === 'fiveHours') return isZh ? t('Every 5 Hours') : t('5 Hours');
  if (type === 'monthly') return isZh ? t('Every Month') : t('Monthly');
  return label;
}

function findWindowItem(items: UsageItem[], windowType: WindowType): UsageItem | undefined {
  return items.find((item) => detectWindowType(item.label) === windowType);
}

function isLowRemaining(item: UsageItem | undefined, thresholdPercent: number): boolean {
  if (!item) return false;
  return item.percent_left < thresholdPercent;
}

function pushSection(lines: string[], title: string, entries: string[]) {
  if (entries.length === 0) return;
  if (lines.length > 0) lines.push('');
  lines.push(`**${title}**`);
  lines.push(...entries.map((entry) => `- ${entry}`));
}

function isLinkIssue(err: unknown): boolean {
  const raw = String(err ?? '').toLowerCase();
  return raw.includes('invalid url')
    || raw.includes('timeout')
    || raw.includes('enotfound')
    || raw.includes('econnreset')
    || raw.includes('network')
    || raw.includes('socket');
}

function buildErrorPresentation(err: unknown): ErrorPresentation {
  const raw = String(err ?? '');
  const lower = raw.toLowerCase();

  if (lower.includes('timeout')) {
    return {
      text: `$(watch) ${t('Ground Control to Major Kimi!')}`,
      tooltip: `${t('Ground Control to Major Kimi!')} ${t('Check baseUrl and network link.')}`,
      isWarning: false,
    };
  }

  if (lower.includes('http 401') || lower.includes('http 403')) {
    return {
      text: `$(lock) ${t('Auth Failed Short')}`,
      tooltip: `${t('Authentication failed. Please check API key and permissions.')}: ${raw}`,
      isWarning: true,
    };
  }

  if (lower.includes('http 429')) {
    return {
      text: `$(warning) ${t('Rate Limited Short')}`,
      tooltip: `${t('Rate limit exceeded. Please wait and retry.')}: ${raw}`,
      isWarning: true,
    };
  }

  if (lower.includes('http 5')) {
    return {
      text: `$(server-process) ${t('Server Error Short')}`,
      tooltip: `${t('Server error from Kimi API. Please retry shortly.')}: ${raw.slice(0, 200)}`,
      isWarning: false,
    };
  }

  if (lower.includes('enotfound') || lower.includes('econnreset') || lower.includes('network') || lower.includes('socket')) {
    return {
      text: `$(broadcast) ${t('Ground Control to Major Kimi!')}`,
      tooltip: `${t('Ground Control to Major Kimi!')} ${t('Check baseUrl and network link.')}`,
      isWarning: false,
    };
  }

  if (lower.includes('invalid url')) {
    return {
      text: `$(link-external) ${t('Ground Control to Major Kimi!')}`,
      tooltip: `${t('Ground Control to Major Kimi!')} ${t('Check baseUrl and network link.')}`,
      isWarning: false,
    };
  }

  return {
    text: `$(error) ${t('Request Failed Short')}`,
    tooltip: `${t('Request Failed Short')}: ${raw.slice(0, 200)}`,
    isWarning: false,
  };
}

async function refresh() {
  const cfg = vscode.workspace.getConfiguration('kimiCodeUsage');
  const apiKey = await resolveApiKey();
  const baseUrl = cfg.get<string>('baseUrl', 'https://api.kimi.com/coding/v1');
  const thresholds = readThresholdSettings(cfg);
  const paceThresholds = readPaceThresholds(cfg);

  if (!apiKey) {
    statusBarItem.text = `$(key) ${t('API Key Missing')}`;
    const missingKeyTooltip = new vscode.MarkdownString(
      [
        `**${t('Ground Control to Major Kimi!')}**`,
        `${t('Set `kimiCodeUsage.apiKey` or `.env` key to reconnect.')}`,
      ].join('\n')
    );
    missingKeyTooltip.isTrusted = false;
    statusBarItem.tooltip = missingKeyTooltip;
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    return;
  }

  if (!baseUrl || !baseUrl.trim()) {
    statusBarItem.text = `$(link-external) ${t('Ground Control to Major Kimi!')}`;
    statusBarItem.tooltip = `${t('Ground Control to Major Kimi!')} ${t('Check baseUrl and network link.')}`;
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    return;
  }

  try {
    const data = await fetchUsage(baseUrl, apiKey);
    const items = parsePayload(data);

    if (items.length === 0) {
      statusBarItem.text = `$(chip) ${t('Kimi: --')}`;
      statusBarItem.tooltip = t('No usage data');
      statusBarItem.backgroundColor = undefined;
      console.warn('[KimiCodeUsage] API returned empty usage items. Payload structure may have changed.');
      return;
    }

    const weeklyItem = findWindowItem(items, 'weekly');
    const fiveHoursItem = findWindowItem(items, 'fiveHours');

    const showPace = cfg.get<boolean>('showPaceIndicator', true);
    const pace = weeklyItem && showPace ? computePace(weeklyItem, getWindowSeconds(weeklyItem.label), paceThresholds) : null;
    const paceState = pace?.state || 'impulse';
    const pacePresentation = getPacePresentation(cfg, paceState);

    const moonEmoji = pace
      ? (pace.state === 'warp' ? '🌒' : pace.state === 'impulse' ? '🌓' : '🌔')
      : '🌓';
    const paceBar = pace ? formatPaceBar(pace.ratio, paceThresholds) : '▰▰▱';

    const suffix = showPace ? `> $(${pacePresentation.icon}) ${pacePresentation.label}` : '';

    const parts = items.map((i) => `${shortLabel(i.label)}:${i.percent_left.toFixed(0)}%`);
    const prefix = `${moonEmoji}  ${paceBar}  ${parts.join(' ')}`.trim();
    statusBarItem.text = `${prefix} ${suffix}`.trim();

    const lowWeekly = isLowRemaining(weeklyItem, thresholds.weekly);
    const lowFiveHours = isLowRemaining(fiveHoursItem, thresholds.fiveHours);
    const shouldRed = pace?.state === 'warp' || lowWeekly || lowFiveHours;

    statusBarItem.backgroundColor = shouldRed
      ? new vscode.ThemeColor('statusBarItem.errorBackground')
      : undefined;

    const overviewEntries = items.map((item) => `${localizedLimitName(item.label)}: ${item.percent_left.toFixed(0)}% ${t('left')}`);

    const resetEntries: string[] = [];
    for (const item of items) {
      const name = localizedLimitName(item.label);
      if (item.reset_at) {
        const formatted = formatResetTimeAbsolute(item.reset_at);
        const line = translator.isZh()
          ? t('{0}: Remaining Fuel: {1} | Refuel: {2}', name, formatted.relative, formatted.absolute)
          : t('{0}: Fuel: {1} | Refuel: {2}', name, formatted.relative, formatted.absolute);
        resetEntries.push(line);
      } else if (item.reset_hint) {
        resetEntries.push(`${name}: ${item.reset_hint}`);
      }
    }

    const paceEntries: string[] = [];
    if (showPace) {
      for (const item of items) {
        const itemPace = computePace(item, getWindowSeconds(item.label), paceThresholds);
        if (!itemPace) continue;
        const itemPacePresentation = getPacePresentation(cfg, itemPace.state);
        const rawDeviation = (itemPace.ratio - 1.0) * 100;
        const deviation = rawDeviation.toFixed(2);
        const sign = rawDeviation > 0 ? '+' : '';
        paceEntries.push(`${localizedLimitName(item.label)}: ${sign}${deviation}% ($(${itemPacePresentation.icon}) ${itemPacePresentation.label})`);
      }
    }

    const markdownLines: string[] = [];
    pushSection(markdownLines, t('Usage Telemetry'), overviewEntries);
    pushSection(markdownLines, t('Pace Details'), paceEntries);
    pushSection(markdownLines, t('Reset Schedule'), resetEntries);

    const tooltip = new vscode.MarkdownString(markdownLines.join('\n'));
    tooltip.supportThemeIcons = true;
    statusBarItem.tooltip = tooltip;
  } catch (err) {
    const errorView = buildErrorPresentation(err);
    statusBarItem.text = errorView.text;
    statusBarItem.tooltip = errorView.tooltip;
    statusBarItem.backgroundColor = errorView.isWarning
      ? new vscode.ThemeColor('statusBarItem.errorBackground')
      : undefined;
  }
}

function fetchUsage(baseUrl: string, apiKey: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const url = new URL(baseUrl + '/usages');
    const req = https.get(
      url,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'User-Agent': 'kimi-usage-vscode/0.1.5',
        },
        timeout: 10000,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(body));
            } catch {
              reject(new Error(t('Invalid JSON response')));
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(t('Request timeout')));
    });
  });
}

function parsePayload(payload: unknown): UsageItem[] {
  const data = payload as Record<string, unknown>;
  const items: UsageItem[] = [];

  const usage = data?.usage;
  if (usage && typeof usage === 'object') {
    const row = toRow(usage as Record<string, unknown>, t('Weekly limit'));
    if (row) items.push(row);
  }

  const limits = data?.limits;
  if (Array.isArray(limits)) {
    for (let i = 0; i < limits.length; i++) {
      const item = limits[i];
      if (!item || typeof item !== 'object') continue;

      const itemObj = item as Record<string, unknown>;
      const detail = (itemObj.detail && typeof itemObj.detail === 'object'
        ? itemObj.detail
        : itemObj) as Record<string, unknown>;

      const label = limitLabel(itemObj, detail, (itemObj.window as Record<string, unknown>) || {}, i);
      const row = toRow(detail, label);
      if (row) items.push(row);
    }
  }

  return items;
}

function toRow(data: Record<string, unknown>, defaultLabel: string): UsageItem | null {
  const limit = toInt(data.limit);
  let used = toInt(data.used);

  if (used == null) {
    const remaining = toInt(data.remaining);
    if (remaining != null && limit != null) used = limit - remaining;
  }
  if (used == null && limit == null) return null;

  const u = used ?? 0;
  const l = limit ?? 0;

  let reset_seconds: number | null = null;
  for (const key of ['reset_in', 'resetIn', 'ttl']) {
    const s = toInt(data[key]);
    if (s != null) {
      reset_seconds = s;
      break;
    }
  }

  if (reset_seconds == null) {
    for (const key of ['reset_at', 'resetAt', 'reset_time', 'resetTime']) {
      const v = data[key];
      if (!v) continue;
      const sec = secondsUntil(String(v));
      if (sec != null && sec > 0) {
        reset_seconds = sec;
        break;
      }
    }
  }

  let reset_at: string | null = null;
  for (const key of ['reset_at', 'resetAt', 'reset_time', 'resetTime']) {
    const v = data[key];
    if (v) {
      reset_at = String(v);
      break;
    }
  }

  return {
    label: String(data.name || data.title || defaultLabel),
    used: u,
    limit: l,
    remaining: l - u,
    percent_left: l > 0 ? ((l - u) / l) * 100 : 0,
    reset_hint: resetHint(data),
    reset_seconds,
    reset_at,
  };
}

function limitLabel(item: Record<string, unknown>, detail: Record<string, unknown>, window: Record<string, unknown>, idx: number): string {
  for (const key of ['name', 'title', 'scope']) {
    const value = item[key] ?? detail[key];
    if (value) return String(value);
  }

  const duration = toInt(window.duration ?? item.duration ?? detail.duration);
  const timeUnit = String(window.timeUnit ?? item.timeUnit ?? detail.timeUnit ?? '');

  if (duration != null) {
    if (timeUnit.includes('MINUTE')) {
      return duration >= 60 && duration % 60 === 0
        ? `${Math.floor(duration / 60)}h limit`
        : `${duration}m limit`;
    }
    if (timeUnit.includes('HOUR')) return `${duration}h limit`;
    if (timeUnit.includes('DAY')) return `${duration}d limit`;
    return `${duration}s limit`;
  }

  return `Limit #${idx + 1}`;
}

function resetHint(data: Record<string, unknown>): string | null {
  for (const key of ['reset_at', 'resetAt', 'reset_time', 'resetTime']) {
    const v = data[key];
    if (v) return formatResetTime(String(v));
  }
  for (const key of ['reset_in', 'resetIn', 'ttl', 'window']) {
    const s = toInt(data[key]);
    if (s) return t('Resets in {0}', formatDuration(s));
  }
  return null;
}

function normalizeIso(val: string): string {
  let iso = val;
  if (iso.includes('.') && iso.endsWith('Z')) {
    const [base, frac] = iso.slice(0, -1).split('.');
    iso = `${base}.${frac.slice(0, 6)}Z`;
  }
  return iso;
}

function secondsUntil(val: string): number | null {
  try {
    const iso = normalizeIso(val);
    const dt = new Date(iso.replace('Z', '+00:00'));
    if (Number.isNaN(dt.getTime())) return null;
    return Math.floor((dt.getTime() - Date.now()) / 1000);
  } catch {
    return null;
  }
}

function formatResetTime(val: string): string {
  const sec = secondsUntil(val);
  if (sec == null) return t('Resets at {0}', val);
  if (sec <= 0) return t('Reset');
  return t('Resets in {0}', formatDuration(sec));
}

function formatDuration(seconds: number): string {
  const isZh = translator.isZh();
  const parts: string[] = [];

  const days = Math.floor(seconds / 86400);
  if (days) parts.push(isZh ? `${days}天` : `${days}d`);

  const rem = seconds % 86400;
  const hours = Math.floor(rem / 3600);
  if (hours) parts.push(isZh ? `${hours}时` : `${hours}h`);

  const mins = Math.floor((rem % 3600) / 60);
  if (mins) parts.push(isZh ? `${mins}分` : `${mins}m`);

  const secs = rem % 60;
  if (secs && !parts.length) parts.push(isZh ? `${secs}秒` : `${secs}s`);

  return parts.join(' ') || (isZh ? '0秒' : '0s');
}

function formatResetTimeAbsolute(val: string): { absolute: string; relative: string } {
  try {
    const iso = normalizeIso(val);
    const dt = new Date(iso.replace('Z', '+00:00'));
    if (Number.isNaN(dt.getTime())) {
      return { absolute: val, relative: t('Unknown') };
    }

    const now = new Date();
    const sec = Math.floor((dt.getTime() - now.getTime()) / 1000);
    const relative = sec <= 0 ? t('Reset') : formatDuration(sec);

    const hours = dt.getHours().toString().padStart(2, '0');
    const mins = dt.getMinutes().toString().padStart(2, '0');

    const resetDay = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    if (resetDay.getTime() === today.getTime()) {
      return { absolute: t('Today {0}:{1}', hours, mins), relative };
    }
    if (resetDay.getTime() === tomorrow.getTime()) {
      return { absolute: t('Tomorrow {0}:{1}', hours, mins), relative };
    }

    const weekdays = [t('Sun'), t('Mon'), t('Tue'), t('Wed'), t('Thu'), t('Fri'), t('Sat')];
    return { absolute: `${weekdays[dt.getDay()]} ${hours}:${mins}`, relative };
  } catch {
    return { absolute: val, relative: t('Unknown') };
  }
}

function toInt(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function shortLabel(label: string): string {
  const type = detectWindowType(label);

  if (type === 'weekly') return translator.isZh() ? t('W-Short') : 'W';
  if (type === 'fiveHours') return translator.isZh() ? t('5H-Short') : '5H';
  if (type === 'monthly') return translator.isZh() ? t('M-Short') : 'M';
  return label.slice(0, 3);
}

async function showDetails() {
  const cfg = vscode.workspace.getConfiguration('kimiCodeUsage');
  const apiKey = await resolveApiKey();
  const baseUrl = cfg.get<string>('baseUrl', 'https://api.kimi.com/coding/v1');

  if (!apiKey) {
    vscode.window.showWarningMessage(`${t('Ground Control to Major Kimi!')} ${t('Set `kimiCodeUsage.apiKey` or `.env` key to reconnect.')}`);
    return;
  }

  if (!baseUrl || !baseUrl.trim()) {
    vscode.window.showWarningMessage(`${t('Ground Control to Major Kimi!')} ${t('Check baseUrl and network link.')}`);
    return;
  }

  try {
    const data = await fetchUsage(baseUrl, apiKey);
    const items = parsePayload(data);
    const paceThresholds = readPaceThresholds(cfg);
    const showPace = cfg.get<boolean>('showPaceIndicator', true);

    const picks: vscode.QuickPickItem[] = items.map((item) => {
      const displayName = localizedLimitName(item.label);
      const label = `${displayName}: ${item.percent_left.toFixed(0)}% ${t('left')}`;
      const segments: string[] = [];
      let detail = '';

      if (showPace) {
        const pace = computePace(item, getWindowSeconds(item.label), paceThresholds);
        if (pace) {
          const rawDeviation = (pace.ratio - 1.0) * 100;
          const deviation = rawDeviation.toFixed(2);
          const sign = rawDeviation > 0 ? '+' : '';
          const pacePresentation = getPacePresentation(cfg, pace.state);
          segments.push(`${t('Warp Factor')}: ${sign}${deviation}%`);
          segments.push(`$(${pacePresentation.icon}) ${pacePresentation.label}`);
        }
      }

      if (item.reset_at) {
        const formatted = formatResetTimeAbsolute(item.reset_at);
        detail = t('Resets {0} (in {1})', formatted.absolute, formatted.relative);
      } else if (item.reset_hint) {
        detail = item.reset_hint;
      }

      return {
        label,
        description: segments.join('  •  '),
        detail,
      };
    });

    vscode.window.showQuickPick(picks, {
      placeHolder: t('Kimi API Usage Details'),
      matchOnDescription: true,
      matchOnDetail: true,
    });
  } catch (err) {
    const rawLower = String(err ?? '').toLowerCase();
    if (isLinkIssue(err)) {
      vscode.window.showWarningMessage(`${t('Ground Control to Major Kimi!')} ${t('Check baseUrl and network link.')}`);
      return;
    }
    if (rawLower.includes('http 5')) {
      vscode.window.showWarningMessage(`${t('Server error from Kimi API. Please retry shortly.')}: ${String(err ?? '').slice(0, 200)}`);
      return;
    }
    const raw = String(err ?? '');
    vscode.window.showWarningMessage(`${t('Usage fetch failed')}: ${raw.slice(0, 200)}`);
  }
}
