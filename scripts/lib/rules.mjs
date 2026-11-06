import net from 'node:net';

import { splitFields } from './sgmodule.mjs';

export const RULE_TYPES = new Set([
  'DOMAIN',
  'DOMAIN-SUFFIX',
  'DOMAIN-KEYWORD',
  'DOMAIN-SET',
  'DOMAIN-WILDCARD',
  'IP-CIDR',
  'IP-CIDR6',
  'IP6-CIDR',
  'IP-ASN',
  'GEOIP',
  'ASN',
  'USER-AGENT',
  'URL-REGEX',
  'PROCESS-NAME',
  'SRC-IP',
  'DEST-PORT',
  'PROTOCOL',
  'FINAL',
  'RULE-SET',
  'SCRIPT',
  'SUBNET',
  'AND',
  'OR',
  'NOT',
]);

/** 校验 CIDR；不写掩码时视为单个 IP。 */
export function validCidr(value, family) {
  const [ip, mask, ...rest] = String(value).split('/');
  if (rest.length > 0) return false;

  const version = net.isIP(ip);
  if (version === 0) return false;
  if (family && version !== family) return false;
  if (mask === undefined) return true;
  if (!/^\d{1,3}$/.test(mask)) return false;

  const bits = Number(mask);
  return bits >= 0 && bits <= (version === 4 ? 32 : 128);
}

/** 校验单条规则（模块 [Rule] 与 .list 规则集共用）。 */
export function checkRuleEntry(text, line, report) {
  const fields = splitFields(text);
  const type = (fields[0] || '').toUpperCase();

  if (!RULE_TYPES.has(type)) {
    report('error', line, `未知规则类型 \`${fields[0]}\``);
    return;
  }

  if (type === 'FINAL') return;

  const value = fields[1];
  if (!value) {
    report('error', line, `规则 ${type} 缺少取值`);
    return;
  }

  if (type === 'IP-CIDR' && !validCidr(value, 4)) {
    report('error', line, `IP-CIDR 取值不合法: ${value}`);
  }

  if ((type === 'IP-CIDR6' || type === 'IP6-CIDR') && !validCidr(value, 6)) {
    report('error', line, `${type} 取值不合法: ${value}`);
  }
}
