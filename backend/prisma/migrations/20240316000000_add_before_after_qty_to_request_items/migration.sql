-- Stage 9: Add before/after quantity snapshot fields to request items
-- Migration: 20240316000000_add_before_after_qty_to_request_items

-- AlterTable StockAdjustmentItem: add beforeQty and afterQty
ALTER TABLE `StockAdjustmentItem`
  ADD COLUMN `beforeQty` DECIMAL(15,4) NULL,
  ADD COLUMN `afterQty`  DECIMAL(15,4) NULL;

-- AlterTable StockTransferItem: add origin and destination before/after qty
ALTER TABLE `StockTransferItem`
  ADD COLUMN `beforeQtyOrigin`      DECIMAL(15,4) NULL,
  ADD COLUMN `afterQtyOrigin`       DECIMAL(15,4) NULL,
  ADD COLUMN `beforeQtyDestination` DECIMAL(15,4) NULL,
  ADD COLUMN `afterQtyDestination`  DECIMAL(15,4) NULL;
