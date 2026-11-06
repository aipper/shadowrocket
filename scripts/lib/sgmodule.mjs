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

/** 按逗号切分条目，保留正则中小括号内被转义的 `\,`。 */
export function splitFields(line) {
  const fields = [];
  let current = '';

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '\\' && line[index + 1] === ',') {
      current += ',';
      index += 1;
      continue;
    }

    if (char === ',') {
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

/** 解析 `key=value` 形式的脚本参数，重复键保留第一个。 */
export function optionMap(fields) {
  const map = new Map();

  for (const field of fields) {
    const separator = field.indexOf('=');
    if (separator === -1) continue;

    const key = field.slice(0, separator).trim().toLowerCase();
    if (!map.has(key)) map.set(key, field.slice(separator + 1).trim());
  }

  return map;
}
