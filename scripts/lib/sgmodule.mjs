// Shadowrocket / Surge 风格模块（.sgmodule）的结构解析。
// 这里只负责把文本切成「指令 / 段落 / 条目」，具体校验规则见 lint-sgmodule.mjs。

const DIRECTIVE_RE = /^#!\s*([A-Za-z][\w-]*)\s*[=:]\s*(.*)$/;
const SECTION_RE = /^\[\s*([^\]]*?)\s*\]$/;
const COMMENT_PREFIXES = ['#', ';', '//'];

export function isBlank(line) {
  return line.trim() === '';
}

export function isComment(line) {
  const trimmed = line.trim();
  return COMMENT_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

/**
 * 按逗号切分条目。
 * - 引号内的逗号保留：argument="A=1,B=2"
 * - 括号内的逗号保留：AND,((PROTOCOL,QUIC),(DOMAIN-SUFFIX,a.com)),REJECT
 * - 花括号内的逗号保留：a{1,3}
 * - `\,` 转义不参与切分
 */
export function splitFields(line) {
  const fields = [];
  let current = '';
  let quote = null;
  let depth = 0;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '\\') {
      current += char;
      if (index + 1 < line.length) {
        current += line[index + 1];
        index += 1;
      }
      continue;
    }

    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }

    if (char === '(' || char === '[' || char === '{') depth += 1;
    else if (char === ')' || char === ']' || char === '}') depth = Math.max(0, depth - 1);

    if (char === ',' && depth === 0) {
      fields.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  fields.push(current.trim());
  return fields;
}

/**
 * @param {string} text
 * @returns {{
 *   directives: Array<{ key: string, value: string, line: number }>,
 *   sections: Array<{ name: string, line: number, entries: Array<{ text: string, line: number }> }>,
 *   orphans: Array<{ text: string, line: number }>,
 * }}
 */
export function parseModule(text) {
  const directives = [];
  const sections = [];
  const orphans = [];
  let current = null;

  text.split('\n').forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();

    if (trimmed === '') return;

    const section = SECTION_RE.exec(trimmed);
    if (section) {
      current = { name: section[1].trim(), line: lineNumber, entries: [] };
      sections.push(current);
      return;
    }

    if (trimmed.startsWith('#')) {
      const directive = DIRECTIVE_RE.exec(trimmed);
      if (directive) {
        directives.push({
          key: directive[1].toLowerCase(),
          value: directive[2].trim(),
          line: lineNumber,
        });
      }
      return;
    }

    if (isComment(trimmed)) return;

    if (current) {
      current.entries.push({ text: trimmed, line: lineNumber });
    } else {
      orphans.push({ text: trimmed, line: lineNumber });
    }
  });

  return { directives, sections, orphans };
}

/** 指令列表转 Map，同时收集重复项。 */
export function directiveMap(directives) {
  const map = new Map();
  const duplicates = [];

  for (const directive of directives) {
    if (map.has(directive.key)) duplicates.push(directive);
    else map.set(directive.key, directive);
  }

  return { map, duplicates };
}

/** 解析 `key=value` 形式的脚本参数，重复键保留第一个，成对引号会被去掉。 */
export function optionMap(fields) {
  const map = new Map();

  for (const field of fields) {
    const separator = field.indexOf('=');
    if (separator === -1) continue;

    const key = field.slice(0, separator).trim().toLowerCase();
    let value = field.slice(separator + 1).trim();

    if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.endsWith(value[0])) {
      value = value.slice(1, -1);
    }

    if (!map.has(key)) map.set(key, value);
  }

  return map;
}

/** 收集模块正文中出现的 {{{参数}}}，返回 参数名 -> 首次出现的行号。 */
export function collectPlaceholders(text) {
  const placeholders = new Map();

  text.split('\n').forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) return;

    for (const match of trimmed.matchAll(/\{\{\{\s*([^{}]+?)\s*\}\}\}/g)) {
      if (!placeholders.has(match[1])) placeholders.set(match[1], index + 1);
    }
  });

  return placeholders;
}

/** 解析 `#!arguments` 声明，返回 参数名 -> 默认值。 */
export function parseArguments(value) {
  const declared = new Map();

  for (const part of splitFields(value)) {
    const item = part.trim();
    if (item === '') continue;

    const separator = item.search(/[:=]/);
    const name = (separator === -1 ? item : item.slice(0, separator)).trim();
    const defaultValue = separator === -1 ? '' : item.slice(separator + 1).trim();

    if (name === '') continue;
    declared.set(name, defaultValue);
  }

  return declared;
}
