-- AlterTable: Update AuditLog to match Stage 8.3 requirements
-- Rename columns: performedBy -> userId, beforeValue -> beforeSnapshot, afterValue -> afterSnapshot
-- Add: warnings column
-- Add: indexes on userId, entityType, timestamp

ALTER TABLE `AuditLog`
  RENAME COLUMN `performedBy` TO `userId`,
  RENAME COLUMN `beforeValue` TO `beforeSnapshot`,
  RENAME COLUMN `afterValue`  TO `afterSnapshot`,
  ADD COLUMN `warnings` JSON NULL;

-- CreateIndex
CREATE INDEX `AuditLog_userId_idx` ON `AuditLog`(`userId`);

-- CreateIndex
CREATE INDEX `AuditLog_entityType_idx` ON `AuditLog`(`entityType`);

-- CreateIndex
CREATE INDEX `AuditLog_timestamp_idx` ON `AuditLog`(`timestamp`);
