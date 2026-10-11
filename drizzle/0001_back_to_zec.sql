-- Orders are paid in ZEC again (PLAN.md, 11 Oct 2026): the amount is kept in zatoshi, not gwei.
ALTER TABLE `orders` RENAME COLUMN `gwei` TO `zat`;--> statement-breakpoint
UPDATE `products` SET `blurb` = replace(`blurb`, 'amount in ETH', 'amount in ZEC') WHERE `kind` = 'test';
