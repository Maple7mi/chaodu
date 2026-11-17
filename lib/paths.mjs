import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA = process.env.SCIENCE_DATA ? path.resolve(process.env.SCIENCE_DATA) : path.join(ROOT, 'data');
export const LIBRARY = path.join(DATA, 'library');
export const ISSUES = path.join(DATA, 'issues');
export const BACKUPS = path.join(DATA, 'backups');
export const PUSH_MARKS = path.join(DATA, 'push');
export const STATE_FILE = path.join(DATA, 'state.json');
export const PUBLIC = path.join(ROOT, 'public');
export const TZ = 'Asia/Shanghai';
export const UNLOCK_HOUR = 8;
