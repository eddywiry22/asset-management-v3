-- Stage 8.1: Add ProductLocation mapping table
-- This table tracks which products are registered/active at which locations.
-- Used by the non-blocking validation layer introduced in Stage 8.

CREATE TABLE `ProductLocation` (
    `id`         VARCHAR(191) NOT NULL,
    `productId`  VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `isActive`   BOOLEAN      NOT NULL DEFAULT true,
    `createdAt`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`  DATETIME(3)  NOT NULL,

    UNIQUE INDEX `ProductLocation_productId_locationId_key`(`productId`, `locationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ProductLocation` ADD CONSTRAINT `ProductLocation_productId_fkey`
    FOREIGN KEY (`productId`) REFERENCES `Product`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductLocation` ADD CONSTRAINT `ProductLocation_locationId_fkey`
    FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
