CREATE TABLE `cloud_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`name` text NOT NULL,
	`snapshot` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`client_hash` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cloud_documents_token_hash_unique` ON `cloud_documents` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_cloud_documents_token` ON `cloud_documents` (`token_hash`);--> statement-breakpoint
CREATE TABLE `cloud_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`revision` integer NOT NULL,
	`snapshot` text NOT NULL,
	`created_at` text NOT NULL,
	`client_hash` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_cloud_versions_document_revision` ON `cloud_versions` (`document_id`,`revision`);