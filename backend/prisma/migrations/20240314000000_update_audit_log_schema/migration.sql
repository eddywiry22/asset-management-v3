-- AlterTable: Update AuditLog to match Stage 8.3 requirements
-- Rename columns: performedBy -> userId, beforeValue -> beforeSnapshot, afterValue -> afterSnapshot
-- Add: warnings column
-- Add: indexes on userId, entityType, timestamp

-- Drop FK before renaming the referenced column
ALTER TABLE `AuditLog` DROP FOREIGN KEY `AuditLog_performedBy_fkey`;

ALTER TABLE `AuditLog`
  CHANGE COLUMN `performedBy` `userId`         VARCHAR(191) NOT NULL,
  CHANGE COLUMN `beforeValue` `beforeSnapshot` JSON NULL,
  CHANGE COLUMN `afterValue`  `afterSnapshot`  JSON NULL,
  ADD COLUMN    `warnings`                     JSON NULL;

-- Re-add FK with the new column name
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX `AuditLog_userId_idx` ON `AuditLog`(`userId`);

-- CreateIndex
CREATE INDEX `AuditLog_entityType_idx` ON `AuditLog`(`entityType`);

-- CreateIndex
CREATE INDEX `AuditLog_timestamp_idx` ON `AuditLog`(`timestamp`);
