CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`actorUserId` int,
	`action` varchar(80) NOT NULL,
	`entityType` varchar(80),
	`entityId` int,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `customers` ADD `consentAt` timestamp;--> statement-breakpoint
ALTER TABLE `customers` ADD `consentSource` varchar(120);--> statement-breakpoint
ALTER TABLE `customers` ADD `consentVersion` varchar(32);--> statement-breakpoint
ALTER TABLE `customers` ADD `anonymizedAt` timestamp;--> statement-breakpoint
CREATE INDEX `audit_org_created_idx` ON `audit_logs` (`organizationId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `audit_logs` (`entityType`,`entityId`);