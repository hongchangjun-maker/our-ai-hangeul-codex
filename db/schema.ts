import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const modelRegistry = sqliteTable('model_registry', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull().default('openai'),
  label: text('label').notNull(),
  tier: text('tier').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  inputPrice: real('input_price'),
  outputPrice: real('output_price'),
  recommendedUse: text('recommended_use').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const aiUsage = sqliteTable('ai_usage', {
  id: text('id').primaryKey(),
  createdAt: text('created_at').notNull(),
  model: text('model').notNull(),
  action: text('action').notNull(),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  status: text('status').notNull(),
  errorCode: text('error_code'),
  clientHash: text('client_hash').notNull(),
}, (table) => [index('idx_ai_usage_client_created').on(table.clientHash, table.createdAt)]);

export const adminAudit = sqliteTable('admin_audit', {
  id: text('id').primaryKey(),
  createdAt: text('created_at').notNull(),
  event: text('event').notNull(),
  success: integer('success', { mode: 'boolean' }).notNull(),
  clientHash: text('client_hash').notNull(),
}, (table) => [index('idx_admin_audit_created').on(table.createdAt)]);
