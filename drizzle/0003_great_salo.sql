ALTER TABLE `orders` ADD `engine_ref` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `received_zat` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `txid` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `owed_zat` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `refunded_at` integer;