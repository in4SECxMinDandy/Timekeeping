import fs from 'node:fs/promises';
import path from 'node:path';
import type { Db } from '../shared/types';
import { createSeedDb } from './seed';

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');

let cache: Db | null = null;
let writeChain: Promise<unknown> = Promise.resolve();

async function persist(db: Db): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${DB_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), 'utf8');
  await fs.rename(tmp, DB_FILE);
}

async function load(): Promise<Db> {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Db;
    if (parsed.version !== 1) throw new Error('Phiên bản dữ liệu không hỗ trợ');
    cache = parsed;
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('[store] Không đọc được db.json, tạo dữ liệu mẫu mới:', (err as Error).message);
    }
    const seeded = await createSeedDb();
    cache = seeded;
    await persist(seeded);
    return seeded;
  }
}

export async function getDb(): Promise<Db> {
  if (!cache) await load();
  return cache!;
}

/** Tuần tự hoá mọi thao tác ghi để không mất dữ liệu. */
export function mutate<T>(fn: (db: Db) => T | Promise<T>): Promise<T> {
  const run = writeChain.then(async () => {
    const db = await getDb();
    const result = await fn(db);
    await persist(db);
    return result;
  });
  writeChain = run.catch(() => undefined);
  return run;
}

export async function resetDb(): Promise<void> {
  cache = null;
  await fs.rm(DB_FILE, { force: true });
  await getDb();
}

export async function savePhoto(dataUrl: string): Promise<string | undefined> {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return undefined;
  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  const buf = Buffer.from(match[2], 'base64');
  if (buf.length > 2_500_000) return undefined;
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
  await fs.writeFile(path.join(UPLOAD_DIR, name), buf);
  return `/uploads/${name}`;
}
