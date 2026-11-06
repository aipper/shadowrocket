import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const OWNER = 'aipper';
export const REPO = 'shadowrocket';
export const BRANCH = process.env.SHADOWROCKET_BRANCH || 'main';

export const RAW_BASE = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}`;
export const CDN_BASE = `https://cdn.jsdelivr.net/gh/${OWNER}/${REPO}@${BRANCH}`;

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = path.resolve(HERE, '..', '..');
