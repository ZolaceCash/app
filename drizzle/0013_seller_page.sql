ALTER TABLE `sellers` ADD `slug` text;--> statement-breakpoint
CREATE UNIQUE INDEX `sellers_slug_unique` ON `sellers` (`slug`);--> statement-breakpoint
UPDATE `sellers` SET `slug` = 'seller-' || substr(`id`, 1, 8) WHERE `slug` IS NULL;
