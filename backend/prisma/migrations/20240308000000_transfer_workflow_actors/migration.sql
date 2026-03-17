-- Stage 7b: Full 7-state approval workflow for StockTransferRequest
-- Replaces simple APPROVED/REJECTED flow with:
--   DRAFT → SUBMITTED → ORIGIN_MANAGER_APPROVED → READY_TO_FINALIZE → FINALIZED
-- Also adds actor/timestamp columns for the full approval chain.

-- Extend enum to the full 7-state machine
ALTER TABLE `StockTransferRequest`
  MODIFY COLUMN `status` ENUM(
    'DRAFT',
    'SUBMITTED',
    'ORIGIN_MANAGER_APPROVED',
    'DESTINATION_OPERATOR_APPROVED',
    'READY_TO_FINALIZE',
    'FINALIZED',
    'CANCELLED'
  ) NOT NULL DEFAULT 'DRAFT';

-- Add workflow timestamp and actor columns
ALTER TABLE `StockTransferRequest`
  ADD COLUMN `submittedAt`             DATETIME(3) NULL,
  ADD COLUMN `originApprovedById`      VARCHAR(191) NULL,
  ADD COLUMN `originApprovedAt`        DATETIME(3) NULL,
  ADD COLUMN `destinationApprovedById` VARCHAR(191) NULL,
  ADD COLUMN `destinationApprovedAt`   DATETIME(3) NULL,
  ADD COLUMN `cancelledById`           VARCHAR(191) NULL,
  ADD COLUMN `cancelledAt`             DATETIME(3) NULL;

-- AddForeignKey for new actor columns
ALTER TABLE `StockTransferRequest`
  ADD CONSTRAINT `StockTransferRequest_originApprovedById_fkey`
    FOREIGN KEY (`originApprovedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `StockTransferRequest`
  ADD CONSTRAINT `StockTransferRequest_destinationApprovedById_fkey`
    FOREIGN KEY (`destinationApprovedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `StockTransferRequest`
  ADD CONSTRAINT `StockTransferRequest_cancelledById_fkey`
    FOREIGN KEY (`cancelledById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
