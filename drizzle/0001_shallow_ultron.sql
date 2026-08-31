CREATE TABLE `automation_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`automationId` int NOT NULL,
	`status` enum('success','failed','skipped') NOT NULL,
	`affectedCount` int NOT NULL DEFAULT 0,
	`message` text NOT NULL,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`finishedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `automation_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `automations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`triggerType` enum('inactivity_days','membership_due','points_reached') NOT NULL,
	`triggerValue` int NOT NULL,
	`actionType` enum('set_at_risk','set_inactive','create_task','queue_recovery','award_points') NOT NULL,
	`actionConfig` json,
	`enabled` boolean NOT NULL DEFAULT true,
	`lastRunAt` timestamp,
	`schedule_cron_task_uid` varchar(65),
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `automations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`audience` enum('all','active','at_risk','inactive') NOT NULL,
	`message` text NOT NULL,
	`templateName` varchar(160),
	`scheduledAt` timestamp,
	`status` enum('draft','scheduled','sent','paused') NOT NULL DEFAULT 'draft',
	`sentCount` int NOT NULL DEFAULT 0,
	`deliveredCount` int NOT NULL DEFAULT 0,
	`repliedCount` int NOT NULL DEFAULT 0,
	`convertedCount` int NOT NULL DEFAULT 0,
	`revenueGenerated` decimal(12,2) NOT NULL DEFAULT '0',
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `customer_activities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`customerId` int NOT NULL,
	`type` enum('note','purchase','message','status_change','points','recovery','task') NOT NULL,
	`content` text NOT NULL,
	`amount` decimal(12,2),
	`metadata` json,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customer_activities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`phone` varchar(32),
	`email` varchar(320),
	`status` enum('active','at_risk','inactive') NOT NULL DEFAULT 'active',
	`pipelineStage` enum('new','contacted','interested','customer','recurring') NOT NULL DEFAULT 'new',
	`registeredAt` timestamp NOT NULL DEFAULT (now()),
	`lastPurchaseAt` timestamp,
	`totalSpent` decimal(12,2) NOT NULL DEFAULT '0',
	`points` int NOT NULL DEFAULT 0,
	`notes` text,
	`lastInteractionAt` timestamp,
	`consentWhatsapp` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `loyalty_rewards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`description` text,
	`pointsCost` int NOT NULL,
	`couponCode` varchar(64),
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `loyalty_rewards_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `loyalty_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`customerId` int NOT NULL,
	`points` int NOT NULL,
	`reason` varchar(180) NOT NULL,
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `loyalty_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `organization_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('owner','manager','operator','viewer') NOT NULL DEFAULT 'operator',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `organization_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `member_organization_user_unique` UNIQUE(`organizationId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`slug` varchar(80) NOT NULL,
	`segment` varchar(80) NOT NULL DEFAULT 'Academia',
	`plan` enum('basic','professional','premium','enterprise') NOT NULL DEFAULT 'professional',
	`activeDays` int NOT NULL DEFAULT 30,
	`riskDays` int NOT NULL DEFAULT 60,
	`timezone` varchar(64) NOT NULL DEFAULT 'America/Sao_Paulo',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `organizations_id` PRIMARY KEY(`id`),
	CONSTRAINT `organizations_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `recovery_cases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`customerId` int NOT NULL,
	`status` enum('pending','contacted','responded','recovered','lost') NOT NULL DEFAULT 'pending',
	`potentialValue` decimal(12,2) NOT NULL DEFAULT '0',
	`recoveredValue` decimal(12,2) NOT NULL DEFAULT '0',
	`campaignId` int,
	`contactedAt` timestamp,
	`respondedAt` timestamp,
	`recoveredAt` timestamp,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `recovery_cases_id` PRIMARY KEY(`id`),
	CONSTRAINT `recovery_org_customer_unique` UNIQUE(`organizationId`,`customerId`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`customerId` int,
	`title` varchar(220) NOT NULL,
	`description` text,
	`dueAt` timestamp,
	`status` enum('open','done','cancelled') NOT NULL DEFAULT 'open',
	`priority` enum('low','medium','high') NOT NULL DEFAULT 'medium',
	`assignedToUserId` int,
	`createdByUserId` int NOT NULL,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `whatsapp_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`customerId` int,
	`campaignId` int,
	`direction` enum('outbound','inbound') NOT NULL,
	`messageType` enum('template','text') NOT NULL DEFAULT 'template',
	`status` enum('queued','sent','delivered','read','failed','received') NOT NULL DEFAULT 'queued',
	`providerMessageId` varchar(255),
	`templateName` varchar(160),
	`body` text,
	`errorMessage` text,
	`sentAt` timestamp,
	`deliveredAt` timestamp,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `whatsapp_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `automation_run_org_idx` ON `automation_runs` (`organizationId`,`startedAt`);--> statement-breakpoint
CREATE INDEX `automation_org_enabled_idx` ON `automations` (`organizationId`,`enabled`);--> statement-breakpoint
CREATE INDEX `automation_cron_idx` ON `automations` (`schedule_cron_task_uid`);--> statement-breakpoint
CREATE INDEX `campaign_org_status_idx` ON `campaigns` (`organizationId`,`status`);--> statement-breakpoint
CREATE INDEX `activity_customer_created_idx` ON `customer_activities` (`customerId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `activity_org_idx` ON `customer_activities` (`organizationId`);--> statement-breakpoint
CREATE INDEX `customer_org_status_idx` ON `customers` (`organizationId`,`status`);--> statement-breakpoint
CREATE INDEX `customer_org_purchase_idx` ON `customers` (`organizationId`,`lastPurchaseAt`);--> statement-breakpoint
CREATE INDEX `reward_org_active_idx` ON `loyalty_rewards` (`organizationId`,`active`);--> statement-breakpoint
CREATE INDEX `loyalty_customer_idx` ON `loyalty_transactions` (`customerId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `member_user_idx` ON `organization_members` (`userId`);--> statement-breakpoint
CREATE INDEX `recovery_org_status_idx` ON `recovery_cases` (`organizationId`,`status`);--> statement-breakpoint
CREATE INDEX `task_org_status_due_idx` ON `tasks` (`organizationId`,`status`,`dueAt`);--> statement-breakpoint
CREATE INDEX `whatsapp_org_status_idx` ON `whatsapp_messages` (`organizationId`,`status`);--> statement-breakpoint
CREATE INDEX `whatsapp_provider_message_idx` ON `whatsapp_messages` (`providerMessageId`);