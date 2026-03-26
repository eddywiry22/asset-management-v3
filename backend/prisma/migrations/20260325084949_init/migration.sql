-- DropForeignKey
ALTER TABLE `Product` DROP FOREIGN KEY `Goods_categoryId_fkey`;

-- DropForeignKey
ALTER TABLE `Product` DROP FOREIGN KEY `Goods_uomId_fkey`;

-- DropForeignKey
ALTER TABLE `Product` DROP FOREIGN KEY `Goods_vendorId_fkey`;

-- AlterTable
ALTER TABLE `User` ALTER COLUMN `username` DROP DEFAULT;

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `Vendor`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_uomId_fkey` FOREIGN KEY (`uomId`) REFERENCES `Uom`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- RedefineIndex
CREATE UNIQUE INDEX `Product_sku_key` ON `Product`(`sku`);
DROP INDEX `Goods_sku_key` ON `Product`;
