import { getEnv } from './env';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function hmac(value: string, secret: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a[index] ^ b[index];
  return mismatch === 0;
}

export function securityConfigured() {
  const env = getEnv();
  return Boolean(env.ADMIN_PASSWORD_HASH && env.SESSION_SECRET && env.SESSION_SECRET.length >= 32);
}

export async function verifyPassword(password: string) {
  const encoded = getEnv().ADMIN_PASSWORD_HASH;
  if (!encoded || password.length < 4 || password.length > 128) return false;
  const [algorithm, iterationText, saltText, expectedText] = encoded.split('$');
  const iterations = Number(iterationText);
  if (algorithm !== 'pbkdf2' || !Number.isSafeInteger(iterations) || iterations < 100_000 || !saltText || !expectedText) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const derived = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: base64UrlToBytes(saltText), iterations }, key, 256));
  return timingSafeEqual(derived, base64UrlToBytes(expectedText));
}

export async function createAdminSession(request: Request) {
  const secret = getEnv().SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not configured');
  const payload = bytesToBase64Url(encoder.encode(JSON.stringify({ exp: Date.now() + 8 * 60 * 60 * 1000 })));
  const signature = bytesToBase64Url(await hmac(payload, secret));
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `our_ai_hangeul_admin=${payload}.${signature}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${secure}`;
}

function cookie(request: Request, name: string) {
  const header = request.headers.get('cookie') ?? '';
  for (const entry of header.split(';')) {
    const [key, ...rest] = entry.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return undefined;
}

export async function isAdmin(request: Request) {
  const secret = getEnv().SESSION_SECRET;
  const token = cookie(request, 'our_ai_hangeul_admin');
  if (!secret || !token) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  const expected = await hmac(payload, secret);
  if (!timingSafeEqual(expected, base64UrlToBytes(signature))) return false;
  try {
    const parsed = JSON.parse(decoder.decode(base64UrlToBytes(payload))) as { exp?: number };
    return typeof parsed.exp === 'number' && parsed.exp > Date.now();
  } catch { return false; }
}

export function clearAdminSession(request: Request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `our_ai_hangeul_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

export function validSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}

export function isJsonRequest(request: Request) {
  return request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() === 'application/json';
}

export async function clientHash(request: Request) {
  const secret = getEnv().SESSION_SECRET || 'not-configured';
  const address = request.headers.get('cf-connecting-ip') || 'local';
  return bytesToBase64Url(await hmac(address, secret));
}

export function json(data: unknown, status = 200, extraHeaders?: HeadersInit) {
  return Response.json(data, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extraHeaders } });
}
