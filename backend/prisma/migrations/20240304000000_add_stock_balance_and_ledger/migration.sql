-- Stage 4: Stock Balances and Stock Ledger

-- CreateEnum
CREATE TABLE IF NOT EXISTS `_prisma_migrations` (
  `id` VARCHAR(36) NOT NULL,
  `checksum` VARCHAR(64) NOT NULL,
  `finished_at` DATETIME(3) NULL,
  `migration_name` VARCHAR(255) NOT NULL,
  `logs` TEXT NULL,
  `rolled_back_at` DATETIME(3) NULL,
  `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `applied_steps_count` INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StockBalance` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `onHandQty` DECIMAL(15,4) NOT NULL DEFAULT 0,
    `reservedQty` DECIMAL(15,4) NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `StockBalance_locationId_idx`(`locationId`),
    UNIQUE INDEX `StockBalance_productId_locationId_key`(`productId`, `locationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StockLedger` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `changeQty` DECIMAL(15,4) NOT NULL,
    `balanceAfter` DECIMAL(15,4) NOT NULL,
    `sourceType` ENUM('ADJUSTMENT', 'MOVEMENT_IN', 'MOVEMENT_OUT', 'SEED') NOT NULL,
    `sourceId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StockLedger_productId_locationId_createdAt_idx`(`productId`, `locationId`, `createdAt`),
    INDEX `StockLedger_locationId_createdAt_idx`(`locationId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `StockBalance` ADD CONSTRAINT `StockBalance_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockBalance` ADD CONSTRAINT `StockBalance_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockLedger` ADD CONSTRAINT `StockLedger_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockLedger` ADD CONSTRAINT `StockLedger_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
