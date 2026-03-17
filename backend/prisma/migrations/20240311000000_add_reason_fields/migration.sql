-- Add rejectedById, rejectedAt, rejectionReason, cancellationReason to StockAdjustmentRequest
ALTER TABLE `StockAdjustmentRequest`
  ADD COLUMN `rejectedById` VARCHAR(191) NULL,
  ADD COLUMN `rejectedAt` DATETIME(3) NULL,
  ADD COLUMN `rejectionReason` TEXT NULL,
  ADD COLUMN `cancellationReason` TEXT NULL;

ALTER TABLE `StockAdjustmentRequest`
  ADD CONSTRAINT `StockAdjustmentRequest_rejectedById_fkey`
  FOREIGN KEY (`rejectedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX `StockAdjustmentRequest_rejectedById_idx` ON `StockAdjustmentRequest`(`rejectedById`);

-- Add cancellationReason to StockTransferRequest
ALTER TABLE `StockTransferRequest`
  ADD COLUMN `cancellationReason` TEXT NULL;
