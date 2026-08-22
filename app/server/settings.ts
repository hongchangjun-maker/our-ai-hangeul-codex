import { getEnv } from './env';
import { DEFAULT_FONT_FAMILY, isBundledFont } from '../domain/font-families';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface RuntimeSettings {
  model: string;
  reasoning: 'none' | 'low' | 'medium' | 'high';
  maxOutputTokens: number;
  autoRouting: boolean;
  defaultFont: string;
  autosaveDelayMs: number;
}

export const DEFAULT_SETTINGS: RuntimeSettings = {
  model: 'gpt-5.6-terra',
  reasoning: 'low',
  maxOutputTokens: 2400,
  autoRouting: true,
  defaultFont: DEFAULT_FONT_FAMILY,
  autosaveDelayMs: 900,
};

const models = [
  ['gpt-5.6-sol', 'GPT-5.6 Sol', '최고성능', 4, 20, '중요 문서, 전문 분석, 장문 작성'],
  ['gpt-5.6-terra', 'GPT-5.6 Terra', '균형형', 2, 12, '일반 문서, 보고서, 문장 수정'],
  ['gpt-5.6-luna', 'GPT-5.6 Luna', '경제형', 0.2, 1.2, '맞춤법, 제목, 짧은 요약'],
] as const;

let initialization: Promise<void> | undefined;

export function getD1() {
  const database = getEnv().DB;
  if (!database) throw new Error('D1 database is unavailable');
  return database;
}

export async function ensureDatabase() {
  if (initialization) return initialization;
  initialization = (async () => {
    const db = getD1();
    await db.batch([
      db.prepare('CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated_at TEXT NOT NULL)'),
      db.prepare('CREATE TABLE IF NOT EXISTS model_registry (id TEXT PRIMARY KEY NOT NULL, provider TEXT NOT NULL DEFAULT \'openai\', label TEXT NOT NULL, tier TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, input_price REAL, output_price REAL, recommended_use TEXT NOT NULL, updated_at TEXT NOT NULL)'),
      db.prepare('CREATE TABLE IF NOT EXISTS ai_usage (id TEXT PRIMARY KEY NOT NULL, created_at TEXT NOT NULL, model TEXT NOT NULL, action TEXT NOT NULL, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, error_code TEXT, client_hash TEXT NOT NULL)'),
      db.prepare('CREATE TABLE IF NOT EXISTS admin_audit (id TEXT PRIMARY KEY NOT NULL, created_at TEXT NOT NULL, event TEXT NOT NULL, success INTEGER NOT NULL, client_hash TEXT NOT NULL)'),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_ai_usage_client_created ON ai_usage (client_hash, created_at)'),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit (created_at)'),
      db.prepare('CREATE TABLE IF NOT EXISTS cloud_documents (id TEXT PRIMARY KEY NOT NULL, token_hash TEXT NOT NULL UNIQUE, name TEXT NOT NULL, snapshot TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, client_hash TEXT NOT NULL)'),
      db.prepare('CREATE TABLE IF NOT EXISTS cloud_versions (id TEXT PRIMARY KEY NOT NULL, document_id TEXT NOT NULL, revision INTEGER NOT NULL, snapshot TEXT NOT NULL, created_at TEXT NOT NULL, client_hash TEXT NOT NULL)'),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_cloud_documents_token ON cloud_documents (token_hash)'),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_cloud_versions_document_revision ON cloud_versions (document_id, revision DESC)'),
    ]);
    const now = '2026-08-22T00:00:00.000Z';
    await db.batch(models.map((model) => db.prepare('INSERT OR IGNORE INTO model_registry (id, provider, label, tier, enabled, input_price, output_price, recommended_use, updated_at) VALUES (?, \'openai\', ?, ?, 1, ?, ?, ?, ?)').bind(model[0], model[1], model[2], model[3], model[4], model[5], now)));
  })().catch((error) => { initialization = undefined; throw error; });
  return initialization;
}

export async function getRuntimeSettings() {
  await ensureDatabase();
  const row = await getD1().prepare('SELECT value FROM app_settings WHERE key = ?').bind('runtime').first<{ value: string }>();
  if (!row) return DEFAULT_SETTINGS;
  try {
    const candidate = JSON.parse(row.value) as Partial<RuntimeSettings>;
    return {
      model: models.some((model) => model[0] === candidate.model) ? candidate.model! : DEFAULT_SETTINGS.model,
      reasoning: ['none', 'low', 'medium', 'high'].includes(candidate.reasoning ?? '') ? candidate.reasoning! : DEFAULT_SETTINGS.reasoning,
      maxOutputTokens: Number.isInteger(candidate.maxOutputTokens) && (candidate.maxOutputTokens ?? 0) >= 128 && (candidate.maxOutputTokens ?? 0) <= 16_000 ? candidate.maxOutputTokens! : DEFAULT_SETTINGS.maxOutputTokens,
      autoRouting: typeof candidate.autoRouting === 'boolean' ? candidate.autoRouting : DEFAULT_SETTINGS.autoRouting,
      defaultFont: typeof candidate.defaultFont === 'string' && isBundledFont(candidate.defaultFont) ? candidate.defaultFont : DEFAULT_SETTINGS.defaultFont,
      autosaveDelayMs: Number.isInteger(candidate.autosaveDelayMs) && (candidate.autosaveDelayMs ?? 0) >= 500 && (candidate.autosaveDelayMs ?? 0) <= 10_000 ? candidate.autosaveDelayMs! : DEFAULT_SETTINGS.autosaveDelayMs,
    };
  } catch { return DEFAULT_SETTINGS; }
}

export async function saveRuntimeSettings(settings: RuntimeSettings) {
  await ensureDatabase();
  await getD1().prepare('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind('runtime', JSON.stringify(settings), new Date().toISOString()).run();
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64Url(value: Uint8Array) {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function encryptionKey() {
  const value = getEnv().SETTINGS_ENCRYPTION_KEY;
  if (!value) throw new Error('SETTINGS_ENCRYPTION_KEY is not configured');
  const bytes = decodeBase64Url(value);
  if (bytes.length !== 32) throw new Error('SETTINGS_ENCRYPTION_KEY must contain 32 bytes');
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function saveOpenAIKey(apiKey: string) {
  if (!apiKey.startsWith('sk-') || apiKey.length < 20 || apiKey.length > 500) throw new Error('OpenAI API Key 형식이 올바르지 않습니다.');
  await ensureDatabase();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode('our-ai-hangeul:openai-key:v1') }, await encryptionKey(), encoder.encode(apiKey)));
  const value = JSON.stringify({ version: 1, iv: encodeBase64Url(iv), ciphertext: encodeBase64Url(encrypted) });
  await getD1().prepare('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind('openai_key', value, new Date().toISOString()).run();
}

export async function hasStoredOpenAIKey() {
  if (getEnv().OPENAI_API_KEY) return true;
  await ensureDatabase();
  return Boolean(await getD1().prepare('SELECT 1 AS present FROM app_settings WHERE key = ?').bind('openai_key').first());
}

export async function getOpenAIKey() {
  if (getEnv().OPENAI_API_KEY) return getEnv().OPENAI_API_KEY;
  await ensureDatabase();
  const row = await getD1().prepare('SELECT value FROM app_settings WHERE key = ?').bind('openai_key').first<{ value: string }>();
  if (!row) return undefined;
  const parsed = JSON.parse(row.value) as { version: number; iv: string; ciphertext: string };
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decodeBase64Url(parsed.iv), additionalData: encoder.encode('our-ai-hangeul:openai-key:v1') }, await encryptionKey(), decodeBase64Url(parsed.ciphertext));
  return decoder.decode(decrypted);
}

export async function getModels() {
  await ensureDatabase();
  const result = await getD1().prepare('SELECT id, label, tier, enabled, input_price AS inputPrice, output_price AS outputPrice FROM model_registry ORDER BY CASE tier WHEN \'최고성능\' THEN 1 WHEN \'균형형\' THEN 2 ELSE 3 END').all();
  return result.results;
}

export async function recordUsage(entry: { id: string; model: string; action: string; inputTokens: number; outputTokens: number; status: string; errorCode?: string; clientHash: string }) {
  await ensureDatabase();
  await getD1().prepare('INSERT INTO ai_usage (id, created_at, model, action, input_tokens, output_tokens, status, error_code, client_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(entry.id, new Date().toISOString(), entry.model, entry.action, entry.inputTokens, entry.outputTokens, entry.status, entry.errorCode ?? null, entry.clientHash).run();
}

export async function rateLimitCount(clientHash: string, since: string) {
  await ensureDatabase();
  const row = await getD1().prepare('SELECT COUNT(*) AS count FROM ai_usage WHERE client_hash = ? AND created_at >= ?').bind(clientHash, since).first<{ count: number }>();
  return Number(row?.count ?? 0);
}

export async function audit(event: string, success: boolean, clientHash: string) {
  await ensureDatabase();
  await getD1().prepare('INSERT INTO admin_audit (id, created_at, event, success, client_hash) VALUES (?, ?, ?, ?, ?)').bind(crypto.randomUUID(), new Date().toISOString(), event, success ? 1 : 0, clientHash).run();
}

export async function failedLoginCount(clientHash: string, since: string) {
  await ensureDatabase();
  const row = await getD1().prepare('SELECT COUNT(*) AS count FROM admin_audit WHERE client_hash = ? AND event = \'login\' AND success = 0 AND created_at >= ?').bind(clientHash, since).first<{ count: number }>();
  return Number(row?.count ?? 0);
}
