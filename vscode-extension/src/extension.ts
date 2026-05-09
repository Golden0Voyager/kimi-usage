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
}

interface PaceState {
  ratio: number;
  state: 'warp' | 'impulse' | 'moonwalk';
}

const WEEKLY_WINDOW_SECONDS = 7 * 24 * 3600;

function computePace(item: UsageItem): PaceState | null {
  if (!item.reset_seconds || item.reset_seconds <= 0) return null;
  if (item.limit <= 0) return null;

  const elapsed = WEEKLY_WINDOW_SECONDS - item.reset_seconds;
  if (elapsed <= 0 || elapsed < 3600) return null;

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

function formatPaceBar(ratio: number): string {
  let filled: number;
  if (ratio > 1.5) filled = 5;
  else if (ratio >= 1.1) filled = 4;
  else if (ratio >= 0.9) filled = 3;
  else if (ratio >= 0.5) filled = 2;
  else filled = 1;
  return '▰'.repeat(filled) + '▱'.repeat(5 - filled);
}

let statusBarItem: vscode.StatusBarItem;
let intervalId: NodeJS.Timeout | undefined;
let translator: Translator;

class Translator {
  private bundle: Record<string, string> = {};
  private useNative: boolean = true;

  constructor(context: vscode.ExtensionContext) {
    this.update(context);
  }

  update(context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration('kimiCodeUsage');
    const lang = config.get<string>('language', 'Auto');

    if (lang === 'Auto') {
      this.useNative = true;
      this.bundle = {};
    } else {
      this.useNative = false;
      const fileName = lang === 'Chinese' ? 'bundle.l10n.zh-cn.json' : 'bundle.l10n.json';
      const filePath = path.join(context.extensionPath, 'l10n', fileName);
      try {
        if (fs.existsSync(filePath)) {
          this.bundle = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
      } catch (e) {
        console.error('Failed to load l10n bundle', e);
        this.useNative = true;
      }
    }
  }

  t(message: string, ...args: any[]): string {
    let str = this.useNative ? vscode.l10n.t(message) : (this.bundle[message] || message);
    if (args.length > 0) {
      args.forEach((arg, i) => {
        str = str.replace(`{${i}}`, String(arg));
      });
    }
    return str;
  }
}

export function activate(context: vscode.ExtensionContext) {
  translator = new Translator(context);
  
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'kimiCodeUsage.showDetails';
  statusBarItem.show();

  const refreshCmd = vscode.commands.registerCommand('kimiCodeUsage.refresh', refresh);
  const detailsCmd = vscode.commands.registerCommand('kimiCodeUsage.showDetails', showDetails);

  // Listen for configuration changes
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

function t(message: string, ...args: any[]): string {
  return translator.t(message, ...args);
}

function restartInterval() {
  if (intervalId) {
    clearInterval(intervalId);
  }
  const cfg = vscode.workspace.getConfiguration('kimiCodeUsage');
  const minutes = cfg.get<number>('refreshIntervalMinutes', 5);
  intervalId = setInterval(refresh, minutes * 60 * 1000);
}

export function deactivate() {
  if (intervalId) {
    clearInterval(intervalId);
  }
}

async function resolveApiKey(): Promise<string> {
  const cfg = vscode.workspace.getConfiguration('kimiCodeUsage');
  const configuredKey = cfg.get<string>('apiKey', '');
  if (configuredKey) return configuredKey;

  // Search workspace .env files
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
            if (match[1] === 'KIMI_CODING_API_KEY') {
              return match[2]; // Highest priority in .env
            } else if (!fallbackKey) {
              fallbackKey = match[2];
            }
          }
        }
        if (fallbackKey) return fallbackKey;
      } catch (e) {
        // .env not found or unreadable in this folder, continue
      }
    }
  }

  // Check process.env (fallback)
  if (process.env.KIMI_CODING_API_KEY) return process.env.KIMI_CODING_API_KEY;
  if (process.env.KIMI_API_KEY) return process.env.KIMI_API_KEY;

  return '';
}

async function refresh() {
  const cfg = vscode.workspace.getConfiguration('kimiCodeUsage');
  const apiKey = await resolveApiKey();
  const baseUrl = cfg.get<string>('baseUrl', 'https://api.kimi.com/coding/v1');

  if (!apiKey) {
    statusBarItem.text = `$(warning) ${t('Kimi: no key')}`;
    statusBarItem.tooltip = t('Set apiKey in VS Code settings or KIMI_CODING_API_KEY env var');
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
}

function fetchUsage(baseUrl: string, apiKey: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = new URL(baseUrl + '/usages');
    const req = https.get(
      url,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'User-Agent': 'kimi-usage-vscode/0.1.0',
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
              reject(new Error('Invalid JSON response'));
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
      reject(new Error('Request timeout'));
    });
  });
}

function parsePayload(payload: any): UsageItem[] {
  const items: UsageItem[] = [];

  const usage = payload?.usage;
  if (usage && typeof usage === 'object') {
    const row = toRow(usage, t('Weekly limit'));
    if (row) items.push(row);
  }

  const limits = payload?.limits;
  if (Array.isArray(limits)) {
    for (let i = 0; i < limits.length; i++) {
      const item = limits[i];
      if (!item || typeof item !== 'object') continue;
      const detail = item.detail && typeof item.detail === 'object' ? item.detail : item;
      const label = limitLabel(item, detail, item.window || {}, i);
      const row = toRow(detail, label);
      if (row) items.push(row);
    }
  }

  return items;
}

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

function limitLabel(item: any, detail: any, window: any, idx: number): string {
  for (const key of ['name', 'title', 'scope']) {
    const v = item[key] || detail[key];
    if (v) return String(v);
  }
  const duration = toInt(window.duration || item.duration || detail.duration);
  const timeUnit = String(window.timeUnit || item.timeUnit || detail.timeUnit || '');
  if (duration != null) {
    if (timeUnit.includes('MINUTE')) return duration >= 60 && duration % 60 === 0 ? `${Math.floor(duration / 60)}h limit` : `${duration}m limit`;
    if (timeUnit.includes('HOUR')) return `${duration}h limit`;
    if (timeUnit.includes('DAY')) return `${duration}d limit`;
    return `${duration}s limit`;
  }
  return `Limit #${idx + 1}`;
}

function resetHint(data: any): string | null {
  for (const key of ['reset_at', 'resetAt', 'reset_time', 'resetTime']) {
    const v = data[key];
    if (v) return formatResetTime(String(v));
  }
  for (const key of ['reset_in', 'resetIn', 'ttl', 'window']) {
    const s = toInt(data[key]);
    if (s) return `resets in ${formatDuration(s)}`;
  }
  return null;
}

function formatResetTime(val: string): string {
  try {
    let iso = val;
    if (iso.includes('.') && iso.endsWith('Z')) {
      const [base, frac] = iso.slice(0, -1).split('.');
      iso = `${base}.${frac.slice(0, 6)}Z`;
    }
    const dt = new Date(iso.replace('Z', '+00:00'));
    const now = new Date();
    const sec = Math.floor((dt.getTime() - now.getTime()) / 1000);
    if (sec <= 0) return 'reset';
    return `resets in ${formatDuration(sec)}`;
  } catch {
    return `resets at ${val}`;
  }
}

function formatDuration(seconds: number): string {
  const parts: string[] = [];
  const days = Math.floor(seconds / 86400);
  if (days) parts.push(`${days}d`);
  const rem = seconds % 86400;
  const hours = Math.floor(rem / 3600);
  if (hours) parts.push(`${hours}h`);
  const mins = Math.floor((rem % 3600) / 60);
  if (mins) parts.push(`${mins}m`);
  const secs = rem % 60;
  if (secs && !parts.length) parts.push(`${secs}s`);
  return parts.join(' ') || '0s';
}

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

    const hours = dt.getHours().toString().padStart(2, '0');
    const mins = dt.getMinutes().toString().padStart(2, '0');
    const isZh = translator.t('left') === '剩余';

    if (sec < 86400 && sec > 0) {
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

function toInt(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function shortLabel(label: string): string {
  const lower = label.toLowerCase();
  const isZh = translator.t('left') === '剩余'; // 简单的判断是否为中文环境

  if (lower.includes('weekly') || lower.includes('week') || lower.includes('周')) {
    return isZh ? '周限额' : 'W';
  }
  if (lower.includes('5h') || lower.includes('5 hour') || lower.includes('5小时')) {
    return isZh ? '5小时' : '5H';
  }
  if (lower.includes('month') || lower.includes('monthly') || lower.includes('月')) {
    return isZh ? '月限额' : 'M';
  }
  return label.slice(0, 3);
}

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
