-- Add REJECTED to TransferRequestStatus enum
ALTER TABLE `StockTransferRequest` MODIFY COLUMN `status` ENUM('DRAFT','SUBMITTED','ORIGIN_MANAGER_APPROVED','DESTINATION_OPERATOR_APPROVED','READY_TO_FINALIZE','FINALIZED','CANCELLED','REJECTED') NOT NULL DEFAULT 'DRAFT';

-- Add rejection columns
ALTER TABLE `StockTransferRequest`
  ADD COLUMN `rejectedById` VARCHAR(191) NULL,
  ADD COLUMN `rejectedAt` DATETIME(3) NULL,
  ADD COLUMN `rejectionReason` TEXT NULL;

-- Add foreign key for rejectedById
ALTER TABLE `StockTransferRequest`
  ADD CONSTRAINT `StockTransferRequest_rejectedById_fkey`
  FOREIGN KEY (`rejectedById`) REFERENCES `User`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Add index
CREATE INDEX `StockTransferRequest_rejectedById_idx` ON `StockTransferRequest`(`rejectedById`);
