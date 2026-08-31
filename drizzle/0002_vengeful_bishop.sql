ALTER TABLE `customers` ADD `loyaltyToken` varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD CONSTRAINT `customers_loyaltyToken_unique` UNIQUE(`loyaltyToken`);