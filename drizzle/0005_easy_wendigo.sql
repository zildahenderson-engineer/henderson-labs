CREATE TABLE `asaas_webhook_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` varchar(180) NOT NULL,
	`event` varchar(100) NOT NULL,
	`providerPaymentId` varchar(100),
	`receivedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `asaas_webhook_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `asaas_webhook_events_eventId_unique` UNIQUE(`eventId`)
);
--> statement-breakpoint
CREATE TABLE `billing_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`requestedPlan` enum('basic','professional','premium') NOT NULL,
	`previousPlan` enum('basic','professional','premium','enterprise'),
	`amount` decimal(10,2) NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'BRL',
	`checkoutId` varchar(100),
	`providerPaymentId` varchar(100),
	`externalReference` varchar(200) NOT NULL,
	`status` enum('pending','confirmed','received','overdue','cancelled','refunded','failed') NOT NULL DEFAULT 'pending',
	`lastEventId` varchar(180),
	`paidAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `billing_payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `billing_payments_externalReference_unique` UNIQUE(`externalReference`),
	CONSTRAINT `billing_provider_payment_unique` UNIQUE(`providerPaymentId`)
);
--> statement-breakpoint
CREATE INDEX `asaas_event_payment_idx` ON `asaas_webhook_events` (`providerPaymentId`);--> statement-breakpoint
CREATE INDEX `billing_org_status_idx` ON `billing_payments` (`organizationId`,`status`);--> statement-breakpoint
CREATE INDEX `billing_event_idx` ON `billing_payments` (`lastEventId`);