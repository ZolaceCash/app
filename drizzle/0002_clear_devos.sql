CREATE TABLE `vault_months` (
	`period` text PRIMARY KEY NOT NULL,
	`from_block` integer NOT NULL,
	`to_block` integer NOT NULL,
	`root` text NOT NULL,
	`total` text NOT NULL,
	`wallets` integer NOT NULL,
	`list` text NOT NULL,
	`recorded_at` integer NOT NULL
);
