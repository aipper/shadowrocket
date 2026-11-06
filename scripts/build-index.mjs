#!/usr/bin/env node
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import prettier from 'prettier';

import { CDN_BASE, RAW_BASE, REPO_ROOT } from './lib/repo.mjs';
import { directiveMap, parseModule } from './lib/sgmodule.mjs';

const START = '<!-- modules:start -->';
const END = '<!-- modules:end -->';
const UNCATEGORIZED = '未分类';
const README_PATH = path.join(REPO_ROOT, 'README.md');
const MODULES_DIR = path.join(REPO_ROOT, 'modules');

async function collectModuleFiles(directory) {
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;

    const absPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectModuleFiles(absPath)));
      continue;
    }

    if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.sgmodule')
      files.push(absPath);
  }

  return files;
}

async function readModule(file) {
  const text = await readFile(file, 'utf8');
  const { map } = directiveMap(parseModule(text).directives);
  const relPath = path.relative(REPO_ROOT, file).split(path.sep).join('/');

  return {
    path: relPath,
    name: map.get('name')?.value || path.basename(relPath, '.sgmodule'),
    desc: map.get('desc')?.value || '',
    author: map.get('author')?.value || '',
    category: map.get('category')?.value || UNCATEGORIZED,
  };
}

function escapeCell(value) {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\s+/g, ' ')
    .trim();
}

function groupByCategory(modules) {
  const groups = new Map();

  for (const module of modules) {
    if (!groups.has(module.category)) groups.set(module.category, []);
    groups.get(module.category).push(module);
  }

  const names = [...groups.keys()].sort((a, b) => {
    if (a === UNCATEGORIZED) return 1;
    if (b === UNCATEGORIZED) return -1;
    return a.localeCompare(b, 'zh-Hans-CN');
  });

  return names.map((name) => [name, groups.get(name)]);
}

function renderIndex(modules) {
  const lines = [START, ''];

  if (modules.length === 0) {
    lines.push('共 **0** 个模块，还没有内容。', '');
  } else {
    lines.push(`共 **${modules.length}** 个模块。`, '');

    for (const [category, list] of groupByCategory(modules)) {
      lines.push(`### ${category}`, '');
      lines.push('| 模块 | 说明 | 作者 | 导入地址 |', '| --- | --- | --- | --- |');

      for (const module of list.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))) {
        const rawUrl = `${RAW_BASE}/${module.path}`;
        const cdnUrl = `${CDN_BASE}/${module.path}`;
        lines.push(
          `| ${escapeCell(module.name)} | ${escapeCell(module.desc)} | ${escapeCell(module.author)} | [raw](${rawUrl}) · [jsDelivr](${cdnUrl}) |`,
        );
      }

      lines.push('');
    }
  }

  lines.push(END);
  return lines.join('\n');
}

async function main() {
  const checkOnly = process.argv.includes('--check');
  const modules = (await Promise.all((await collectModuleFiles(MODULES_DIR)).map(readModule))).sort(
    (a, b) => a.path.localeCompare(b.path),
  );

  const readme = await readFile(README_PATH, 'utf8');
  const start = readme.indexOf(START);
  const end = readme.indexOf(END);

  if (start === -1 || end === -1 || end < start) {
    console.error(`README.md 缺少 ${START} / ${END} 标记，无法写入索引`);
    process.exitCode = 1;
    return;
  }

  const nextRaw = `${readme.slice(0, start)}${renderIndex(modules)}${readme.slice(end + END.length)}`;
  const prettierConfig = (await prettier.resolveConfig(README_PATH)) || {};
  const next = await prettier.format(nextRaw, { ...prettierConfig, parser: 'markdown' });

  if (next === readme) {
    console.log(`✔ README 索引已是最新（${modules.length} 个模块）`);
    return;
  }

  if (checkOnly) {
    console.error('✖ README 索引不是最新，请运行 `npm run index`');
    process.exitCode = 1;
    return;
  }

  await writeFile(README_PATH, next, 'utf8');
  console.log(`✔ README 索引已更新（${modules.length} 个模块）`);
}

await main();
