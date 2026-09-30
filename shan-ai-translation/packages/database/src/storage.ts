import { createHmac, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface ObjectStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  signedPath(key: string, ttlSeconds: number): string;
}

function sign(secret: string, key: string, exp: number): string {
  return createHmac('sha256', secret).update(`${exp}.${key}`).digest('base64url');
}

export function verifySignedToken(secret: string, token: string): { key: string } {
  const parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as {
    key?: string;
    exp?: number;
    sig?: string;
  };
  if (!parsed.key || !parsed.exp || !parsed.sig) throw new Error('bad token');
  if (parsed.exp < Date.now()) throw new Error('expired');
  const expected = sign(secret, parsed.key, parsed.exp);
  const a = Buffer.from(expected);
  const b = Buffer.from(parsed.sig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('bad signature');
  return { key: parsed.key };
}

export class LocalStorage implements ObjectStorage {
  constructor(
    private readonly root: string,
    private readonly secret: string,
  ) {}

  async put(key: string, body: Buffer): Promise<void> {
    const full = path.join(this.root, key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
  }

  async get(key: string): Promise<Buffer> {
    return readFile(path.join(this.root, key));
  }

  signedPath(key: string, ttlSeconds: number): string {
    const exp = Date.now() + ttlSeconds * 1000;
    const sig = sign(this.secret, key, exp);
    const token = Buffer.from(JSON.stringify({ key, exp, sig })).toString('base64url');
    return `/api/v1/storage/download?token=${token}`;
  }
}

export class SupabaseStorage implements ObjectStorage {
  constructor(
    private readonly url: string,
    private readonly serviceKey: string,
    private readonly bucket: string,
    private readonly secret: string,
  ) {}

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    const endpoint = `${this.url}/storage/v1/object/${this.bucket}/${key}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.serviceKey}`,
        'Content-Type': contentType,
        'x-upsert': 'true',
      },
      body: new Uint8Array(body),
    });
    if (!response.ok) {
      throw new Error(`storage upload failed (${response.status})`);
    }
  }

  async get(key: string): Promise<Buffer> {
    const endpoint = `${this.url}/storage/v1/object/${this.bucket}/${key}`;
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${this.serviceKey}` },
    });
    if (!response.ok) throw new Error(`storage read failed (${response.status})`);
    return Buffer.from(await response.arrayBuffer());
  }

  signedPath(key: string, ttlSeconds: number): string {
    const exp = Date.now() + ttlSeconds * 1000;
    const sig = sign(this.secret, key, exp);
    const token = Buffer.from(JSON.stringify({ key, exp, sig })).toString('base64url');
    return `/api/v1/storage/download?token=${token}`;
  }
}

function monorepoRoot(): string {
  let dir = process.cwd();
  for (let depth = 0; depth < 6; depth += 1) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

export function createStorage(): ObjectStorage {
  const secret = process.env.STORAGE_SIGNING_SECRET || 'dev-only-change-me';
  if (process.env.STORAGE_DRIVER === 'supabase') {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      throw new Error(
        'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for supabase storage',
      );
    }
    return new SupabaseStorage(
      url,
      serviceKey,
      process.env.SUPABASE_STORAGE_BUCKET || 'private',
      secret,
    );
  }
  const configured = process.env.STORAGE_LOCAL_PATH || './var/storage';
  const root = path.isAbsolute(configured) ? configured : path.resolve(monorepoRoot(), configured);
  return new LocalStorage(root, secret);
}
