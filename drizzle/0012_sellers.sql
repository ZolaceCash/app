CREATE TABLE `sellers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`engine_key` text NOT NULL,
	`network` text NOT NULL,
	`created_at` integer NOT NULL,
	`closed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sellers_token_hash_unique` ON `sellers` (`token_hash`);--> statement-breakpoint
ALTER TABLE `orders` ADD `seller_id` text;--> statement-breakpoint
ALTER TABLE `products` ADD `seller_id` text REFERENCES sellers(id);--> statement-breakpoint
ALTER TABLE `products` ADD `taken_down_at` integer;