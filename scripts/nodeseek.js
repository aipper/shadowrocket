/******************************
 * NodeSeek 每日签到（Shadowrocket 模块脚本）
 *
 * 功能：
 *   - 从模块参数读取配置（Cookie捕获 / 签到时间 / 固定奖励 / 显示总数）
 *   - 捕获登录请求头并保存到本地，供定时签到复用
 *   - 定时调用签到接口，输出通知并累计个人统计
 *
 * 说明：
 *   本脚本为独立实现，仅参考了 iab0x00/ProxyRules 中 NodeSeek 模块的接口用法，
 *   未复制上游代码（上游仓库未声明许可证）。
 *******************************/

const SCRIPT_NAME = 'NodeSeek 签到';
const HEADERS_KEY = 'nodeseek_headers_v1';
const STATS_KEY = 'nodeseek_stats_v1';
const API_BASE = 'https://www.nodeseek.com';

// 捕获后长期复用的请求头（小写，HTTP 头名大小写不敏感）
const CAPTURE_FIELDS = [
  'cookie',
  'user-agent',
  'referer',
  'origin',
  'accept',
  'accept-language',
  'content-type',
  'priority',
  'sec-fetch-mode',
  'refract-key',
  'refract-sign',
];

const DEFAULT_HEADERS = {
  accept: '*/*',
  'accept-language': 'zh-CN,zh-Hans;q=0.9',
  'content-type': 'text/plain;charset=UTF-8',
  origin: 'https://www.nodeseek.com',
  priority: 'u=3, i',
  referer: 'https://www.nodeseek.com/',
  'sec-fetch-mode': 'cors',
  'user-agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
};

function log(message) {
  console.log(`[${SCRIPT_NAME}] ${message}`);
}

function notify(subtitle, body) {
  log(`${subtitle}：${body}`);
  if (typeof $notification !== 'undefined' && $notification.post) {
    $notification.post(SCRIPT_NAME, subtitle, body);
  }
}

function parseArguments(raw) {
  const args = {};
  if (!raw) return args;

  for (const pair of String(raw).split(/[&,]/)) {
    const item = pair.trim();
    if (!item) continue;

    const separator = item.indexOf('=');
    if (separator > 0) args[item.slice(0, separator).trim()] = item.slice(separator + 1).trim();
    else args[item] = 'true';
  }

  return args;
}

function enabled(args, key) {
  const value = args[key];
  if (value === undefined || value === null || String(value).trim() === '') return false;

  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function headerValue(headers, name) {
  if (!headers) return '';

  const target = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() !== target) continue;

    const value = headers[key];
    if (Array.isArray(value)) return value.join('; ');
    return value === undefined || value === null ? '' : String(value).trim();
  }

  return '';
}

function captureHeaders(headers) {
  const saved = {};

  for (const field of CAPTURE_FIELDS) {
    const value = headerValue(headers, field);
    if (value) saved[field] = value;
  }

  return saved;
}

function buildHeaders(saved) {
  const headers = Object.assign({}, DEFAULT_HEADERS, saved || {});
  return headers;
}

function todayKey() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function readStats() {
  const stats = { days: 0, total: 0, lastDate: '' };
  const raw = $persistentStore.read(STATS_KEY);
  if (!raw) return stats;

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.days === 'number' && typeof parsed.total === 'number') {
      stats.days = parsed.days;
      stats.total = parsed.total;
      stats.lastDate = typeof parsed.lastDate === 'string' ? parsed.lastDate : '';
    }
  } catch (error) {
    log(`统计数据损坏，已忽略：${error.message || error}`);
  }

  return stats;
}

function recordStats(gain) {
  const stats = readStats();
  const today = todayKey();

  if (typeof gain === 'number' && gain > 0 && stats.lastDate !== today) {
    stats.days += 1;
    stats.total += gain;
    stats.lastDate = today;
    $persistentStore.write(JSON.stringify(stats), STATS_KEY);
  }

  return stats;
}

function statsLine(stats) {
  if (stats.days <= 0 || stats.total <= 0) return '';
  return `累计签到 ${stats.days} 天，日均 ${(stats.total / stats.days).toFixed(1)} 鸡腿`;
}

function httpPost(url, headers) {
  return new Promise((resolve, reject) => {
    $httpClient.post({ url, headers, body: '', timeout: 15 }, (error, response, data) => {
      if (error) {
        reject(new Error(String(error)));
        return;
      }

      resolve({
        status: response && typeof response.status === 'number' ? response.status : 0,
        body: data === undefined || data === null ? '' : String(data),
      });
    });
  });
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function runCapture(args) {
  if (!enabled(args, 'ENABLE_CAPTURE')) {
    $done({});
    return;
  }

  if (typeof $request === 'undefined') {
    $done({});
    return;
  }

  const saved = captureHeaders($request.headers);

  if (!saved.cookie) {
    log('请求中没有 Cookie，忽略本次捕获');
    $done({});
    return;
  }

  const serialized = JSON.stringify(saved);

  if ($persistentStore.read(HEADERS_KEY) === serialized) {
    log('登录信息没有变化，跳过保存');
    $done({});
    return;
  }

  $persistentStore.write(serialized, HEADERS_KEY);
  notify('Cookie 已捕获', '登录信息已保存，请关闭模块的「Cookie捕获」参数');
  $done({});
}

async function runCheckin(args) {
  const fixed = enabled(args, 'FIXED_REWARD');
  const showTotal = enabled(args, 'SHOW_TOTAL');
  const raw = $persistentStore.read(HEADERS_KEY);

  if (!raw) {
    notify('缺少 Cookie', '请先开启「Cookie捕获」，再用 NodeSeek 打开个人页');
    $done();
    return;
  }

  let saved = null;
  try {
    saved = JSON.parse(raw);
  } catch (error) {
    saved = null;
  }

  if (!saved || !saved.cookie) {
    notify('Cookie 数据异常', '请重新开启「Cookie捕获」，再用 NodeSeek 打开个人页');
    $done();
    return;
  }

  const url = `${API_BASE}/api/attendance?random=${fixed ? 'false' : 'true'}`;
  log(`开始签到（${fixed ? '固定奖励' : '随机奖励'}）`);

  let response;
  try {
    response = await httpPost(url, buildHeaders(saved));
  } catch (error) {
    notify('网络错误', `签到请求失败：${error.message || error}`);
    $done();
    return;
  }

  const data = parseJson(response.body) || {};
  const message = typeof data.message === 'string' ? data.message : '';
  log(`HTTP ${response.status}：${response.body}`);

  if (response.status === 403) {
    notify('签到失败：被风控', message || 'HTTP 403，请稍后再试');
    $done();
    return;
  }

  if (/请先登录|未登录|登录已失效/.test(message)) {
    notify('Cookie 已失效', '请重新开启「Cookie捕获」，再用 NodeSeek 打开个人页');
    $done();
    return;
  }

  if (/已完成签到|已签到/.test(message)) {
    notify('今日已签到', message || '今天已经签过了，明天再来');
    $done();
    return;
  }

  if (response.status >= 200 && response.status < 300 && data.success === true) {
    const gain = typeof data.gain === 'number' ? data.gain : null;
    const stats = recordStats(gain);
    const lines = [gain === null ? message || '签到完成' : `本次获得 ${gain} 鸡腿`];

    if (showTotal && typeof data.current === 'number') lines.push(`当前共 ${data.current} 鸡腿`);

    const summary = statsLine(stats);
    if (summary) lines.push(summary);

    notify('签到成功', lines.join('\n'));
    $done();
    return;
  }

  notify('签到失败', `HTTP ${response.status}${message ? `：${message}` : ''}`);
  $done();
}

const args = parseArguments(typeof $argument === 'undefined' ? '' : $argument);

if (typeof $request !== 'undefined') runCapture(args);
else runCheckin(args);
