import * as vscode from 'vscode';
import * as https from 'https';

interface UsageItem {
  label: string;
  used: number;
  limit: number;
  remaining: number;
  percent_left: number;
  reset_hint: string | null;
}

let statusBarItem: vscode.StatusBarItem;
let intervalId: NodeJS.Timeout | undefined;

export function activate(context: vscode.ExtensionContext) {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'kimiUsage.showDetails';
  statusBarItem.show();

  const refreshCmd = vscode.commands.registerCommand('kimiUsage.refresh', refresh);
  const detailsCmd = vscode.commands.registerCommand('kimiUsage.showDetails', showDetails);

  // Listen for configuration changes
  const configChangeDisposable = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('kimiUsage')) {
      restartInterval();
      refresh();
    }
  });

  context.subscriptions.push(statusBarItem, refreshCmd, detailsCmd, configChangeDisposable);

  refresh();
  restartInterval();
}

function restartInterval() {
  if (intervalId) {
    clearInterval(intervalId);
  }
  const cfg = vscode.workspace.getConfiguration('kimiUsage');
  const minutes = cfg.get<number>('refreshIntervalMinutes', 5);
  intervalId = setInterval(refresh, minutes * 60 * 1000);
}

export function deactivate() {
  if (intervalId) {
    clearInterval(intervalId);
  }
}

async function refresh() {
  const cfg = vscode.workspace.getConfiguration('kimiUsage');
  const apiKey = cfg.get<string>('apiKey', '') || process.env.KIMI_CODING_API_KEY || '';
  const baseUrl = cfg.get<string>('baseUrl', 'https://api.kimi.com/coding/v1');

  if (!apiKey) {
    statusBarItem.text = `$(warning) ${vscode.l10n.t('Kimi: no key')}`;
    statusBarItem.tooltip = vscode.l10n.t('Set kimiUsage.apiKey in VS Code settings or KIMI_CODING_API_KEY env var');
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    return;
  }

  try {
    const data = await fetchUsage(baseUrl, apiKey);
    const items = parsePayload(data);

    if (items.length === 0) {
      statusBarItem.text = `$(chip) ${vscode.l10n.t('Kimi: --')}`;
      statusBarItem.tooltip = vscode.l10n.t('No usage data');
      statusBarItem.backgroundColor = undefined;
      return;
    }

    const minPercent = Math.min(...items.map(i => i.percent_left));
    const emoji = minPercent <= 10 ? '$(error)' : minPercent <= 30 ? '$(warning)' : '$(chip)';
    const parts = items.map(i => `${shortLabel(i.label)}:${i.percent_left.toFixed(0)}%`);
    statusBarItem.text = `${emoji} Kimi ${parts.join(' ')}`;

    const lines = items.map(
      i => `${i.label}: ${i.used.toLocaleString()}/${i.limit.toLocaleString()} (${i.percent_left.toFixed(0)}% ${vscode.l10n.t('left')})${i.reset_hint ? ' — ' + i.reset_hint : ''}`
    );
    statusBarItem.tooltip = lines.join('\n');

    if (minPercent <= cfg.get<number>('criticalPercent', 10)) {
      statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    } else if (minPercent <= cfg.get<number>('warnPercent', 30)) {
      statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      statusBarItem.backgroundColor = undefined;
    }
  } catch (err) {
    statusBarItem.text = `$(sync~spin) ${vscode.l10n.t('Kimi: err')}`;
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
    const row = toRow(usage, vscode.l10n.t('Weekly limit'));
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
  return {
    label: String(data.name || data.title || defaultLabel),
    used: u,
    limit: l,
    remaining: l - u,
    percent_left: l > 0 ? ((l - u) / l) * 100 : 0,
    reset_hint: resetHint(data),
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

function toInt(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function shortLabel(label: string): string {
  const lower = label.toLowerCase();
  if (lower.includes('weekly') || lower.includes('week')) return 'W';
  if (lower.includes('5h') || lower.includes('5 hour')) return '5H';
  if (lower.includes('month') || lower.includes('monthly')) return 'M';
  return label.slice(0, 2).toUpperCase();
}

async function showDetails() {
  const cfg = vscode.workspace.getConfiguration('kimiUsage');
  const apiKey = cfg.get<string>('apiKey', '') || process.env.KIMI_CODING_API_KEY || '';
  const baseUrl = cfg.get<string>('baseUrl', 'https://api.kimi.com/coding/v1');

  if (!apiKey) {
    vscode.window.showWarningMessage(vscode.l10n.t('Kimi API key not configured.'));
    return;
  }

  try {
    const data = await fetchUsage(baseUrl, apiKey);
    const items = parsePayload(data);
    const picks = items.map((i) => ({
      label: `${i.label}: ${i.percent_left.toFixed(0)}% ${vscode.l10n.t('left')}`,
      description: `${i.used.toLocaleString()} / ${i.limit.toLocaleString()}${i.reset_hint ? '  ·  ' + i.reset_hint : ''}`,
    }));
    vscode.window.showQuickPick(picks, { placeHolder: vscode.l10n.t('Kimi API Usage Details') });
  } catch (err) {
    vscode.window.showErrorMessage(vscode.l10n.t('Kimi usage fetch failed: {0}', String(err)));
  }
}
