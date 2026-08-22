DROP INDEX `idx_ai_usage_created_client`;--> statement-breakpoint
CREATE INDEX `idx_ai_usage_client_created` ON `ai_usage` (`client_hash`,`created_at`);