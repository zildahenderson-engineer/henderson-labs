CREATE TABLE `ai_conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(160) NOT NULL DEFAULT 'Nova conversa',
	`lastMessageAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ai_conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ai_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`conversationId` int NOT NULL,
	`role` enum('user','assistant') NOT NULL,
	`content` text NOT NULL,
	`toolsUsed` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ai_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ai_usage` (
	`id` int AUTO_INCREMENT NOT NULL,
	`organizationId` int NOT NULL,
	`userId` int NOT NULL,
	`conversationId` int,
	`promptTokens` int NOT NULL DEFAULT 0,
	`completionTokens` int NOT NULL DEFAULT 0,
	`model` varchar(120),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ai_usage_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `organizations` ADD `onboardingCompletedAt` timestamp;--> statement-breakpoint
CREATE INDEX `ai_conversation_org_user_idx` ON `ai_conversations` (`organizationId`,`userId`,`lastMessageAt`);--> statement-breakpoint
CREATE INDEX `ai_message_conversation_idx` ON `ai_messages` (`conversationId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `ai_usage_org_created_idx` ON `ai_usage` (`organizationId`,`createdAt`);