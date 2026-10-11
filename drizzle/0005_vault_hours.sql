CREATE TABLE `vault_hours` (
	`hour` integer PRIMARY KEY NOT NULL,
	`from_block` integer NOT NULL,
	`to_block` integer NOT NULL,
	`wallets` text NOT NULL,
	`each` text NOT NULL,
	`funded` text NOT NULL,
	`total` text NOT NULL,
	`root` text,
	`counted_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `vault_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`vault` text NOT NULL,
	`hour` integer NOT NULL,
	`block` integer NOT NULL,
	`balances` text NOT NULL,
	`earned` text NOT NULL,
	`funded` text NOT NULL,
	`rates` text NOT NULL
);
