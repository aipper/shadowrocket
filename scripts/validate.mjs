#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { lintRuleList } from './lib/lint-list.mjs';
import { lintSgmodule } from './lib/lint-sgmodule.mjs';
import { REPO_ROOT } from './lib/repo.mjs';
import { lintTextHygiene } from './lib/text.mjs';

const execFileAsync = promisify(execFile);

const SCAN_DIRS = ['modules', 'rules', 'configs', 'scripts'];
const EXTRA_FILES = ['docs/TEMPLATE.sgmodule'];
const TEXT_EXTENSIONS = new Set(['.sgmodule', '.list', '.conf']);
const JS_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const KEBAB_CASE_RE = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const cliFiles = args.filter((arg) => !arg.startsWith('--'));

const issues = [];

function toRelative(file) {
  return path.relative(REPO_ROOT, path.resolve(REPO_ROOT, file)).split(path.sep).join('/');
}

function createReport(relPath) {
  return (level, line, message) => {
    issues.push({
      file: relPath,
      level,
      line: Math.max(1, Number(line) || 1),
      message,
    });
  };
}

async function walk(directory) {
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
      files.push(...(await walk(absPath)));
      continue;
    }

    if (!entry.isFile()) continue;

    const extension = path.extname(entry.name).toLowerCase();
    if (TEXT_EXTENSIONS.has(extension) || JS_EXTENSIONS.has(extension)) files.push(absPath);
  }

  return files;
}

async function lintFile(file) {
  const relPath = toRelative(file);
  const absPath = path.join(REPO_ROOT, relPath);
  const extension = path.extname(relPath).toLowerCase();
  const report = createReport(relPath);

  if (JS_EXTENSIONS.has(extension)) {
    if (!relPath.startsWith('scripts/')) return;

    try {
      await execFileAsync(process.execPath, ['--check', absPath]);
    } catch (error) {
      const detail = String(error.stderr || error.message)
        .split('\n')
        .filter(Boolean)
        .slice(0, 3)
        .join(' ')
        .trim();
      report('error', 1, `JS 语法检查失败: ${detail}`);
    }
    return;
  }

  if (!TEXT_EXTENSIONS.has(extension)) return;

  const buffer = await readFile(absPath);

  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    report('warn', 1, '文件包含 BOM，建议保存为 UTF-8 无 BOM');
  }

  const text = buffer.toString('utf8');
  lintTextHygiene(text, report);

  if (extension === '.sgmodule') {
    if (relPath.startsWith('modules/') && !KEBAB_CASE_RE.test(path.basename(relPath, extension))) {
      report('warn', 1, '文件名建议使用小写 kebab-case，例如 ad-remover.sgmodule');
    }
    lintSgmodule(text, report);
    return;
  }

  if (extension === '.list') {
    lintRuleList(text, report);
    return;
  }

  text.split('\n').forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#') || /^\[[^\]]+\]$/.test(trimmed)) return;
    if (!trimmed.includes('='))
      report('error', index + 1, `配置行应为 key = value: ${trimmed.slice(0, 60)}`);
  });
}

async function main() {
  const discovered = (
    await Promise.all(SCAN_DIRS.map((directory) => walk(path.join(REPO_ROOT, directory))))
  ).flat();

  const targets =
    cliFiles.length > 0
      ? cliFiles.map((file) => path.resolve(REPO_ROOT, file))
      : [...discovered, ...EXTRA_FILES.map((file) => path.join(REPO_ROOT, file))];

  for (const file of targets) await lintFile(file);

  const errors = issues.filter((issue) => issue.level === 'error').length;
  const warnings = issues.length - errors;

  if (issues.length === 0) {
    console.log(`✔ 检查 ${targets.length} 个文件，全部通过`);
    return;
  }

  const grouped = new Map();
  for (const issue of issues) {
    if (!grouped.has(issue.file)) grouped.set(issue.file, []);
    grouped.get(issue.file).push(issue);
  }

  for (const [file, list] of [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`\n${file}`);
    for (const issue of list.sort((a, b) => a.line - b.line)) {
      const label = issue.level === 'error' ? '✖ error' : '⚠ warn ';
      console.log(`  ${label} ${String(issue.line).padStart(4)}  ${issue.message}`);
    }
  }

  console.log(`\n检查 ${targets.length} 个文件：${errors} error(s)，${warnings} warning(s)`);

  if (errors > 0 || (strict && warnings > 0)) process.exitCode = 1;
}

await main();
