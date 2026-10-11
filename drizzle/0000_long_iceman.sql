CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` integer NOT NULL,
	`stock_id` integer,
	`state` text NOT NULL,
	`price_cents` integer NOT NULL,
	`gwei` integer NOT NULL,
	`address` text NOT NULL,
	`public_key` text NOT NULL,
	`wrapped_key` text NOT NULL,
	`sealed` text,
	`test` integer NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`seen_at` integer,
	`delivered_at` integer,
	`closed_at` integer,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`blurb` text NOT NULL,
	`price_cents` integer NOT NULL,
	`kind` text NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_slug_unique` ON `products` (`slug`);--> statement-breakpoint
CREATE TABLE `stock` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`payload` text,
	`state` text DEFAULT 'free' NOT NULL,
	`order_id` text,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
