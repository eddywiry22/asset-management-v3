-- Stage 7: Add APPROVED and REJECTED states to TransferRequestStatus enum
-- MySQL requires MODIFY COLUMN to extend an ENUM type.

ALTER TABLE `StockTransferRequest`
  MODIFY COLUMN `status` ENUM('DRAFT','APPROVED','REJECTED','FINALIZED') NOT NULL DEFAULT 'DRAFT';
