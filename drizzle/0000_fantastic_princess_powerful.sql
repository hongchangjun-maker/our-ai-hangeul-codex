CREATE TABLE `admin_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`event` text NOT NULL,
	`success` integer NOT NULL,
	`client_hash` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ai_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`model` text NOT NULL,
	`action` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`error_code` text,
	`client_hash` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `model_registry` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text DEFAULT 'openai' NOT NULL,
	`label` text NOT NULL,
	`tier` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`input_price` real,
	`output_price` real,
	`recommended_use` text NOT NULL,
	`updated_at` text NOT NULL
);
