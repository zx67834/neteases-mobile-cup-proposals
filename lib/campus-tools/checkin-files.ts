import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type CheckinEvidenceMeta = {
  id: string;
  name: string;
  mime: string;
  size: number;
  /** Relative path under the check-in data root */
  stored: string;
};

const MAX_FILE_BYTES = 40 * 1024 * 1024; // 40MB
const MAX_FILES_PER_CHECKIN = 6;

const ALLOWED_PREFIXES = ['image/', 'audio/', 'video/', 'text/'];
const ALLOWED_EXACT = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

export function checkinDataRoot() {
  return path.join(process.cwd(), '.data', 'campus-checkin');
}

export function isAllowedCheckinMime(mime: string) {
  const m = (mime || '').toLowerCase();
  if (!m) return false;
  if (ALLOWED_EXACT.has(m)) return true;
  return ALLOWED_PREFIXES.some((p) => m.startsWith(p));
}

export async function saveCheckinEvidenceFiles(input: {
  studentId: string;
  checkinDate: string;
  files: Array<{ name: string; mime: string; bytes: Buffer }>;
}): Promise<CheckinEvidenceMeta[]> {
  if (input.files.length > MAX_FILES_PER_CHECKIN) {
    throw new Error(`每次最多上传 ${MAX_FILES_PER_CHECKIN} 个文件`);
  }
  const dir = path.join(checkinDataRoot(), input.studentId, input.checkinDate);
  await mkdir(dir, { recursive: true });

  const out: CheckinEvidenceMeta[] = [];
  for (const file of input.files) {
    if (!isAllowedCheckinMime(file.mime)) {
      throw new Error(`不支持的文件类型：${file.mime || file.name}`);
    }
    if (file.bytes.length > MAX_FILE_BYTES) {
      throw new Error(`文件过大（上限 40MB）：${file.name}`);
    }
    const fid = `ev_${randomBytes(8).toString('base64url')}`;
    const safeName = file.name.replace(/[^\w.\u4e00-\u9fff()-]+/g, '_').slice(0, 80) || 'file';
    const stored = path.join(input.studentId, input.checkinDate, `${fid}_${safeName}`);
    await writeFile(path.join(checkinDataRoot(), stored), file.bytes);
    out.push({
      id: fid,
      name: file.name.slice(0, 120),
      mime: file.mime || 'application/octet-stream',
      size: file.bytes.length,
      stored: stored.replace(/\\/g, '/'),
    });
  }
  return out;
}

export async function readCheckinEvidenceFile(stored: string) {
  const root = checkinDataRoot();
  const abs = path.normalize(path.join(root, stored));
  if (!abs.startsWith(path.normalize(root + path.sep))) {
    throw new Error('非法路径');
  }
  return readFile(abs);
}
