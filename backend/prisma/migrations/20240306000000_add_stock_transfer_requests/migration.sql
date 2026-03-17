-- Stage 6: Stock Transfer Requests
-- Migration: 20240306000000_add_stock_transfer_requests

-- AlterTable: extend LedgerSourceType enum with TRANSFER_IN / TRANSFER_OUT
ALTER TABLE `StockLedger` MODIFY COLUMN `sourceType` ENUM('ADJUSTMENT', 'MOVEMENT_IN', 'MOVEMENT_OUT', 'SEED', 'TRANSFER_IN', 'TRANSFER_OUT') NOT NULL;

-- CreateTable
CREATE TABLE `StockTransferRequest` (
    `id` VARCHAR(191) NOT NULL,
    `requestNumber` VARCHAR(191) NOT NULL,
    `status` ENUM('DRAFT', 'FINALIZED') NOT NULL DEFAULT 'DRAFT',
    `sourceLocationId` VARCHAR(191) NOT NULL,
    `destinationLocationId` VARCHAR(191) NOT NULL,
    `notes` TEXT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `finalizedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `StockTransferRequest_requestNumber_key`(`requestNumber`),
    INDEX `StockTransferRequest_status_idx`(`status`),
    INDEX `StockTransferRequest_createdById_idx`(`createdById`),
    INDEX `StockTransferRequest_sourceLocationId_idx`(`sourceLocationId`),
    INDEX `StockTransferRequest_destinationLocationId_idx`(`destinationLocationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StockTransferItem` (
    `id` VARCHAR(191) NOT NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `qty` DECIMAL(15,4) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StockTransferItem_requestId_idx`(`requestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `StockTransferRequest` ADD CONSTRAINT `StockTransferRequest_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockTransferRequest` ADD CONSTRAINT `StockTransferRequest_sourceLocationId_fkey` FOREIGN KEY (`sourceLocationId`) REFERENCES `Location`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockTransferRequest` ADD CONSTRAINT `StockTransferRequest_destinationLocationId_fkey` FOREIGN KEY (`destinationLocationId`) REFERENCES `Location`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockTransferItem` ADD CONSTRAINT `StockTransferItem_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `StockTransferRequest`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockTransferItem` ADD CONSTRAINT `StockTransferItem_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
