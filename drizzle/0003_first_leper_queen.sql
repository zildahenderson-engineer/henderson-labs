DROP INDEX `whatsapp_provider_message_idx` ON `whatsapp_messages`;--> statement-breakpoint
ALTER TABLE `loyalty_transactions` ADD `automationKey` varchar(180);--> statement-breakpoint
ALTER TABLE `loyalty_transactions` ADD CONSTRAINT `loyalty_automation_key_unique` UNIQUE(`automationKey`);--> statement-breakpoint
ALTER TABLE `whatsapp_messages` ADD CONSTRAINT `whatsapp_provider_message_unique` UNIQUE(`providerMessageId`);