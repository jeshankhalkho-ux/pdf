import { createHmac, timingSafeEqual } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';

export interface Payload {
  /** template name + its data, OR a raw doc spec */
  tpl?: string;
  data?: unknown;
  doc?: unknown;
  /** file name shown in Telegram */
  fn?: string;
  /** expiry, unix seconds */
  exp: number;
}

const mac = (body: string, secret: string) => createHmac('sha256', secret).update(body).digest();

/** token = base64url(deflate(json)) + "." + base64url(hmac). Nothing is stored server-side. */
export function signToken(p: Payload, secret: string): string {
  const body = deflateRawSync(Buffer.from(JSON.stringify(p))).toString('base64url');
  return `${body}.${mac(body, secret).toString('base64url')}`;
}

export function verifyToken(token: string, secret: string): Payload | null {
  const i = token.lastIndexOf('.');
  if (i < 1) return null;
  const body = token.slice(0, i);
  const want = mac(body, secret);
  const got = Buffer.from(token.slice(i + 1), 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const raw = inflateRawSync(Buffer.from(body, 'base64url'), { maxOutputLength: 500_000 });
    const p = JSON.parse(raw.toString()) as Payload;
    if (typeof p?.exp !== 'number' || p.exp < Date.now() / 1000) return null;
    return p;
  } catch {
    return null;
  }
}
