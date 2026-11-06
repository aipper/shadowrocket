import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CODE = await readFile(path.join(ROOT, 'scripts', 'nodeseek.js'), 'utf8');

const HEADERS_KEY = 'nodeseek_headers_v1';
const STATS_KEY = 'nodeseek_stats_v1';
const STORED_HEADERS = JSON.stringify({
  cookie: 'session=abc',
  'refract-key': 'key',
  'refract-sign': 'sign',
});

function todayKey() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function createHarness({
  request = null,
  argument = '',
  stored = null,
  stats = null,
  response = { status: 200, body: '{}' },
} = {}) {
  const store = new Map();
  if (stored !== null) store.set(HEADERS_KEY, stored);
  if (stats !== null) store.set(STATS_KEY, JSON.stringify(stats));

  const notifications = [];
  const requests = [];
  let finish;
  const donePromise = new Promise((resolve) => {
    finish = resolve;
  });

  const sandbox = {
    $argument: argument,
    $persistentStore: {
      read: (key) => (store.has(key) ? store.get(key) : null),
      write: (value, key) => {
        store.set(key, value);
        return true;
      },
    },
    $notification: {
      post: (...args) => notifications.push(args),
    },
    $httpClient: {
      post: (options, callback) => {
        requests.push(options);
        setTimeout(() => {
          if (response.error) callback(new Error(response.error), null, null);
          else callback(null, { status: response.status }, response.body);
        }, 0);
      },
    },
    $done: (value) => finish(value),
    console: { log: () => {} },
    setTimeout,
  };

  if (request) sandbox.$request = { headers: request };

  vm.runInNewContext(CODE, sandbox);

  return { store, notifications, requests, done: donePromise };
}

test('Cookie捕获关闭时不保存请求头', async () => {
  const harness = createHarness({
    request: { Cookie: 'session=abc' },
    argument: 'ENABLE_CAPTURE=false',
  });

  await harness.done;

  assert.equal(harness.store.has(HEADERS_KEY), false);
  assert.equal(harness.notifications.length, 0);
});

test('Cookie捕获开启时按字段保存请求头', async () => {
  const harness = createHarness({
    request: {
      Cookie: 'session=abc',
      'User-Agent': 'UA/1.0',
      'Refract-Sign': 'sig',
      'X-Ignored': 'nope',
    },
    argument: 'ENABLE_CAPTURE=true',
  });

  await harness.done;

  const saved = JSON.parse(harness.store.get(HEADERS_KEY));
  assert.equal(saved.cookie, 'session=abc');
  assert.equal(saved['user-agent'], 'UA/1.0');
  assert.equal(saved['refract-sign'], 'sig');
  assert.equal(saved['x-ignored'], undefined);
  assert.equal(harness.notifications[0][1], 'Cookie 已捕获');
});

test('默认随机奖励签到成功并累计统计', async () => {
  const harness = createHarness({
    stored: STORED_HEADERS,
    argument: 'SHOW_TOTAL=true',
    response: {
      status: 200,
      body: JSON.stringify({ success: true, message: '签到成功', gain: 5, current: 42 }),
    },
  });

  await harness.done;

  assert.equal(harness.requests.length, 1);
  assert.equal(harness.requests[0].url, 'https://www.nodeseek.com/api/attendance?random=true');
  assert.equal(harness.requests[0].headers.cookie, 'session=abc');

  assert.deepEqual(JSON.parse(harness.store.get(STATS_KEY)), {
    days: 1,
    total: 5,
    lastDate: todayKey(),
  });

  const [, subtitle, body] = harness.notifications[0];
  assert.equal(subtitle, '签到成功');
  assert.match(body, /本次获得 5 鸡腿/);
  assert.match(body, /当前共 42 鸡腿/);
  assert.match(body, /累计签到 1 天，日均 5\.0 鸡腿/);
});

test('固定奖励开关切换 random=false', async () => {
  const harness = createHarness({
    stored: STORED_HEADERS,
    argument: 'FIXED_REWARD=true',
    response: { status: 200, body: JSON.stringify({ success: true, gain: 5, message: 'ok' }) },
  });

  await harness.done;

  assert.ok(harness.requests[0].url.endsWith('random=false'));
});

test('同一天重复签到不重复累计', async () => {
  const harness = createHarness({
    stored: STORED_HEADERS,
    stats: { days: 3, total: 12, lastDate: todayKey() },
    response: { status: 200, body: JSON.stringify({ success: true, message: 'ok', gain: 5 }) },
  });

  await harness.done;

  assert.deepEqual(JSON.parse(harness.store.get(STATS_KEY)), {
    days: 3,
    total: 12,
    lastDate: todayKey(),
  });
});

test('今日已签到', async () => {
  const harness = createHarness({
    stored: STORED_HEADERS,
    response: { status: 200, body: JSON.stringify({ success: false, message: '今日已完成签到' }) },
  });

  await harness.done;

  assert.equal(harness.notifications[0][1], '今日已签到');
  assert.equal(harness.store.has(STATS_KEY), false);
});

test('Cookie 失效', async () => {
  const harness = createHarness({
    stored: STORED_HEADERS,
    response: { status: 401, body: JSON.stringify({ success: false, message: '请先登录' }) },
  });

  await harness.done;

  assert.equal(harness.notifications[0][1], 'Cookie 已失效');
});

test('403 风控', async () => {
  const harness = createHarness({
    stored: STORED_HEADERS,
    response: { status: 403, body: JSON.stringify({ message: '访问受限' }) },
  });

  await harness.done;

  assert.equal(harness.notifications[0][1], '签到失败：被风控');
});

test('缺少 Cookie 时给出提示且不发请求', async () => {
  const harness = createHarness({ argument: 'FIXED_REWARD=false' });

  await harness.done;

  assert.equal(harness.requests.length, 0);
  assert.equal(harness.notifications[0][1], '缺少 Cookie');
});

test('网络错误', async () => {
  const harness = createHarness({
    stored: STORED_HEADERS,
    response: { error: 'timeout' },
  });

  await harness.done;

  assert.equal(harness.notifications[0][1], '网络错误');
  assert.match(harness.notifications[0][2], /timeout/);
});
