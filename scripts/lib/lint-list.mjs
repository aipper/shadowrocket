import { checkRuleEntry } from './rules.mjs';
import { isComment } from './sgmodule.mjs';

/** 校验 .list 规则集：每行 `TYPE,VALUE[,POLICY]`。 */
export function lintRuleList(text, report) {
  text.split('\n').forEach((line, index) => {
    const trimmed = line.trim();

    if (trimmed === '' || isComment(trimmed)) return;
    if (/^\[[^\]]+\]$/.test(trimmed)) return;

    checkRuleEntry(trimmed, index + 1, report);
  });
}
