import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

import { CDN_BASE, OWNER, RAW_BASE, REPO, REPO_ROOT } from './repo.mjs';
import { RULE_TYPES, checkRuleEntry, validCidr } from './rules.mjs';
import { directiveMap, optionMap, parseModule } from './sgmodule.mjs';

const KNOWN_DIRECTIVES = new Set([
  'name',
  'desc',
  'system',
  'author',
  'homepage',
  'icon',
  'category',
  'date',
  'version',
]);

const KNOWN_SECTIONS = new Set([
  'General',
  'MITM',
  'Script',
  'Rule',
  'URL Rewrite',
  'Header Rewrite',
  'Body Rewrite',
  'Map Local',
  'Host',
  'Panel',
]);

const SCRIPT_TYPES = new Set([
  'http-request',
  'http-response',
  'cron',
  'event',
  'dns',
  'rule',
  'generic',
]);

const SCRIPT_OPTIONS = new Set([
  'script-path',
  'script',
  'requires-body',
  'max-size',
  'binary-body-mode',
  'timeout',
  'tag',
  'engine',
  'argument',
  'debug',
  'cronexp',
  'wake-system',
  'early-timeout',
  'enable',
  'type',
  'script-update-interval',
]);

const MITM_KEYS = new Set([
  'hostname',
  'skip-server-cert-verify',
  'client-source-address',
  'tcp-connection',
]);

const HEADER_ACTIONS = new Set(['header-add', 'header-del', 'header-replace', 'header-merge']);

const ATTRIBUTION_RE = /(来源|源地址|原作者|出处|upstream|source)\s*[:：]/i;

function isValidRegex(pattern) {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

function isValidHostname(host) {
  const trimmed = host.replace(/^-/, '');

  if (trimmed === '' || /[\s/:]/.test(trimmed)) return false;
  if (trimmed === '*') return true;
  if (trimmed.includes('*') && !trimmed.startsWith('*.')) return false;

  return /^(\*\.)?[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$/.test(trimmed);
}

function safeUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** script-path 指向本仓库文件时，确认文件真实存在。 */
function checkScriptTarget(target, line, report) {
  if (/^http:\/\//i.test(target)) {
    report('error', line, 'script-path 必须使用 https，Shadowrocket 会拒绝明文 http');
    return;
  }

  if (!/^https:\/\//i.test(target)) {
    const suggestion = `${RAW_BASE}/${target.replace(/^\/+/, '')}`;
    report(
      'error',
      line,
      `script-path 必须是绝对 URL（Shadowrocket 不解析相对路径），建议：${suggestion}`,
    );
    return;
  }

  const url = safeUrl(target);
  if (!url) {
    report('error', line, `script-path 不是合法 URL: ${target}`);
    return;
  }

  let repoPath = null;

  if (url.hostname === 'raw.githubusercontent.com') {
    const parts = url.pathname.replace(/^\//, '').split('/');
    if (parts[0] === OWNER && parts[1] === REPO && parts.length >= 4) {
      repoPath = parts.slice(3).join('/');
    }
  } else if (
    url.hostname === 'cdn.jsdelivr.net' &&
    url.pathname.startsWith(`/gh/${OWNER}/${REPO}@`)
  ) {
    const rest = url.pathname.slice(`/gh/${OWNER}/${REPO}@`.length);
    const slash = rest.indexOf('/');
    if (slash !== -1) repoPath = rest.slice(slash + 1);
  }

  if (!repoPath) return;

  const decoded = decodeURIComponent(repoPath);
  if (!existsSync(path.join(REPO_ROOT, decoded))) {
    report('error', line, `script-path 指向的仓库文件不存在: ${decoded}`);
    report('warn', line, `可用地址示例：${CDN_BASE}/${decoded}`);
  }
}

function lintScript(section, report) {
  let httpScripts = 0;

  for (const entry of section.entries) {
    const tokens = entry.text.split(/\s+/);
    const type = (tokens[0] || '').toLowerCase();

    if (!SCRIPT_TYPES.has(type)) {
      report(
        'error',
        entry.line,
        `未知脚本类型 \`${tokens[0]}\`，允许：${[...SCRIPT_TYPES].join(', ')}`,
      );
      continue;
    }

    // cron 的匹配规则由 5 段组成，其余类型只占 1 段
    const patternSize = type === 'cron' ? 5 : 1;
    const pattern = tokens.slice(1, 1 + patternSize).join(' ');
    const optionText = tokens.slice(1 + patternSize).join(' ');

    if (!pattern) {
      report('error', entry.line, '缺少匹配规则（脚本类型后的第二个字段）');
    } else if (type.startsWith('http')) {
      httpScripts += 1;
      if (!isValidRegex(pattern)) report('warn', entry.line, `匹配规则不是合法正则: ${pattern}`);
    } else if (type === 'cron' && pattern.split(/\s+/).length < 5) {
      report('warn', entry.line, `cron 表达式应有 5 段: ${pattern}`);
    }

    const options = optionMap(optionText.split(','));

    for (const key of options.keys()) {
      if (!SCRIPT_OPTIONS.has(key)) report('warn', entry.line, `未知脚本参数 \`${key}\``);
    }

    const script = options.get('script-path') || options.get('script');
    if (!script) {
      report('error', entry.line, '缺少 `script-path=…`');
      continue;
    }

    checkScriptTarget(script, entry.line, report);
  }

  return httpScripts;
}

function lintMitm(section, report) {
  const hosts = new Set();
  let declared = false;

  for (const entry of section.entries) {
    const separator = entry.text.indexOf('=');

    if (separator === -1) {
      report('error', entry.line, 'MITM 条目应为 `key = value`');
      continue;
    }

    const key = entry.text.slice(0, separator).trim().toLowerCase();
    const value = entry.text.slice(separator + 1).trim();

    if (!MITM_KEYS.has(key)) {
      report('warn', entry.line, `[MITM] 未知键 \`${key}\``);
      continue;
    }

    if (key !== 'hostname') continue;

    declared = true;
    const list = value.replace(/^%(append|insert)%/i, '').trim();

    if (!list) {
      report('error', entry.line, 'hostname 为空');
      continue;
    }

    for (const rawHost of list.split(',')) {
      const host = rawHost.trim();
      if (!host) continue;

      if (!isValidHostname(host)) report('error', entry.line, `hostname 不合法: ${host}`);
      if (hosts.has(host)) report('warn', entry.line, `hostname 重复: ${host}`);
      hosts.add(host);
    }
  }

  return declared && hosts.size > 0;
}

function lintRule(section, report) {
  for (const entry of section.entries) checkRuleEntry(entry.text, entry.line, report);
}

function lintUrlRewrite(section, report) {
  for (const entry of section.entries) {
    const [pattern, target, ...flags] = entry.text.split(/\s+/);

    if (!pattern || !target) {
      report('error', entry.line, 'URL Rewrite 至少需要「匹配规则 + 目标」两个字段');
      continue;
    }

    if (!isValidRegex(pattern)) report('warn', entry.line, `匹配规则不是合法正则: ${pattern}`);

    if (target === '-') {
      if (flags.length === 0) report('warn', entry.line, '`-` 后面应跟动作，例如 `- reject`');
    } else if (
      !/^https?:\/\//i.test(target) &&
      !target.startsWith('/') &&
      !target.startsWith('$')
    ) {
      report('warn', entry.line, `重写目标不像 URL: ${target}`);
    }
  }
}

function lintHeaderRewrite(section, report) {
  for (const entry of section.entries) {
    const [pattern, rawAction, header, ...valueParts] = entry.text.split(/\s+/);

    if (!pattern || !rawAction || !header) {
      report('error', entry.line, 'Header Rewrite 需要「匹配规则 + 动作 + 头名称」');
      continue;
    }

    if (!isValidRegex(pattern)) report('warn', entry.line, `匹配规则不是合法正则: ${pattern}`);

    const action = rawAction.toLowerCase();
    if (!HEADER_ACTIONS.has(action)) {
      report(
        'error',
        entry.line,
        `未知动作 \`${rawAction}\`，允许：${[...HEADER_ACTIONS].join(', ')}`,
      );
    }

    if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(header)) {
      report('warn', entry.line, `头名称不合法: ${header}`);
    }

    if (action !== 'header-del' && valueParts.length === 0) {
      report('warn', entry.line, `\`${action}\` 缺少头值`);
    }
  }
}

function lintMapLocal(section, report) {
  for (const entry of section.entries) {
    const [pattern, target] = entry.text.split(/\s+/);

    if (!pattern || !target) {
      report('error', entry.line, 'Map Local 需要「匹配规则 + 本地路径」');
      continue;
    }

    if (!isValidRegex(pattern)) report('warn', entry.line, `匹配规则不是合法正则: ${pattern}`);

    if (target !== '-' && !target.startsWith('/') && !/^https?:\/\//i.test(target)) {
      report('warn', entry.line, `本地路径应以 / 开头: ${target}`);
    }
  }
}

function lintBodyRewrite(section, report) {
  for (const entry of section.entries) {
    const [pattern, ...replacement] = entry.text.split(/\s+/);

    if (!pattern || replacement.length === 0) {
      report('warn', entry.line, 'Body Rewrite 通常需要「匹配规则 + 替换内容」');
      continue;
    }

    if (!isValidRegex(pattern)) report('warn', entry.line, `匹配规则不是合法正则: ${pattern}`);
  }
}

function lintHost(section, report) {
  for (const entry of section.entries) {
    const separator = entry.text.indexOf('=');

    if (separator === -1) {
      report('error', entry.line, 'Host 条目应为 `域名 = IP`');
      continue;
    }

    const host = entry.text.slice(0, separator).trim();
    const address = entry.text.slice(separator + 1).trim();

    if (!isValidHostname(host)) report('warn', entry.line, `域名不合法: ${host}`);
    if (address !== '-' && net.isIP(address) === 0) {
      report('error', entry.line, `Host 目标应为 IP: ${address}`);
    }
  }
}

function lintKeyValue(section, report) {
  for (const entry of section.entries) {
    if (!entry.text.includes('=')) {
      report('error', entry.line, `[${section.name}] 条目应为 \`key = value\`：${entry.text}`);
    }
  }
}

const SECTION_LINTERS = {
  Script: lintScript,
  MITM: lintMitm,
  Rule: lintRule,
  'URL Rewrite': lintUrlRewrite,
  'Header Rewrite': lintHeaderRewrite,
  'Map Local': lintMapLocal,
  'Body Rewrite': lintBodyRewrite,
  Host: lintHost,
  Panel: lintKeyValue,
  General: lintKeyValue,
};

/**
 * 校验一个 .sgmodule 文件。
 * @param {string} text
 * @param {(level: 'error' | 'warn', line: number, message: string) => void} report
 */
export function lintSgmodule(text, report) {
  const { directives, sections, orphans } = parseModule(text);
  const { map: meta, duplicates } = directiveMap(directives);

  const name = meta.get('name');
  if (!name || !name.value) {
    report(
      'error',
      directives[0]?.line ?? 1,
      '缺少 `#!name = 模块名`，Shadowrocket 无法显示模块名',
    );
  } else if (directives[0]?.key !== 'name') {
    report('warn', directives[0].line, '`#!name` 建议放在文件第一行');
  }

  for (const [key, directive] of meta) {
    if (!KNOWN_DIRECTIVES.has(key)) {
      report(
        'warn',
        directive.line,
        `未知指令 \`#!${key}\`，Shadowrocket 会忽略；来源请用 \`# 来源：…\` 注释`,
      );
    }
  }

  if (!meta.get('desc')?.value)
    report('warn', name?.line ?? 1, '缺少 `#!desc`，模块列表只显示名称');

  const system = meta.get('system');
  if (system?.value && system.value.toLowerCase() !== 'ios') {
    report('warn', system.line, `\`#!system\` 为 ${system.value}，Shadowrocket 只支持 iOS`);
  }

  const hasAttribution = Boolean(meta.get('author')?.value) || ATTRIBUTION_RE.test(text);
  if (!hasAttribution) {
    report('warn', 1, '缺少作者或来源信息（`#!author` 或 `# 来源：…`），聚合第三方内容时必须标注');
  }

  for (const directive of duplicates)
    report('warn', directive.line, `重复指令 \`#!${directive.key}\``);
  for (const orphan of orphans) {
    report('error', orphan.line, `段落外的内容无法解析: ${orphan.text.slice(0, 60)}`);
  }

  const seen = new Map();
  for (const section of sections) {
    if (!KNOWN_SECTIONS.has(section.name)) {
      report(
        'error',
        section.line,
        `未知段落 [${section.name}]，允许：${[...KNOWN_SECTIONS].join(', ')}`,
      );
      continue;
    }

    if (seen.has(section.name)) report('warn', section.line, `重复段落 [${section.name}]`);
    else seen.set(section.name, section);

    if (section.entries.length === 0) report('warn', section.line, `段落 [${section.name}] 为空`);
  }

  let httpScripts = 0;
  let mitmDeclared = false;

  for (const [sectionName, lint] of Object.entries(SECTION_LINTERS)) {
    const section = seen.get(sectionName);
    if (!section) continue;

    const result = lint(section, report);
    if (sectionName === 'Script') httpScripts = result || 0;
    if (sectionName === 'MITM') mitmDeclared = Boolean(result);
  }

  if (httpScripts > 0 && !mitmDeclared) {
    report(
      'warn',
      seen.get('Script').line,
      '存在 http-* 脚本但未声明 [MITM] hostname，请求不会被解密',
    );
  }
}

export { RULE_TYPES, validCidr };
