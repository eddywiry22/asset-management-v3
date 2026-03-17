-- Add CANCELLED status to AdjustmentRequestStatus enum
ALTER TABLE `StockAdjustmentRequest` MODIFY COLUMN `status` ENUM('DRAFT','SUBMITTED','APPROVED','REJECTED','FINALIZED','CANCELLED') NOT NULL DEFAULT 'DRAFT';

-- Add cancelledById and cancelledAt columns
ALTER TABLE `StockAdjustmentRequest`
  ADD COLUMN `cancelledById` VARCHAR(191) NULL,
  ADD COLUMN `cancelledAt` DATETIME(3) NULL;

-- Add foreign key for cancelledById
ALTER TABLE `StockAdjustmentRequest`
  ADD CONSTRAINT `StockAdjustmentRequest_cancelledById_fkey`
  FOREIGN KEY (`cancelledById`) REFERENCES `User`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Add index
CREATE INDEX `StockAdjustmentRequest_cancelledById_fkey` ON `StockAdjustmentRequest`(`cancelledById`);
