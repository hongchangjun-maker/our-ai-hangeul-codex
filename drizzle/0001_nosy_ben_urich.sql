CREATE INDEX `idx_admin_audit_created` ON `admin_audit` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_ai_usage_created_client` ON `ai_usage` (`created_at`,`client_hash`);