/**
 * Stage 8.1 — Non-blocking validation helpers.
 *
 * All helpers return a structured result and NEVER throw.
 * They are designed for warning-only integration; enforcement
 * will be added in Stage 8.2+.
 *
 * M1 compatibility: "NOT REGISTERED" (missing row) is treated identically
 * to "INACTIVE" in all validation logic.  Use isProductActiveAtLocation()
 * instead of checking row existence directly.
 */

import prisma from '../config/database';

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Check whether a user has any role mapping to the given location.
 * Uses existing UserLocationRole table (DO NOT create UserLocation).
 */
export async function validateUserAccess(
  userId: string,
  locationId: string,
): Promise<ValidationResult> {
  try {
    const access = await prisma.userLocationRole.findFirst({
      where: { userId, locationId },
    });
    return access
      ? { valid: true }
      : { valid: false, reason: 'USER_NO_ACCESS_TO_LOCATION' };
  } catch {
    return { valid: false, reason: 'USER_NO_ACCESS_TO_LOCATION' };
  }
}

/**
 * Check whether a location exists and is active.
 */
export async function validateLocationActive(
  locationId: string,
): Promise<ValidationResult> {
  try {
    const location = await prisma.location.findUnique({
      where: { id: locationId },
    });
    if (!location || !location.isActive) {
      return { valid: false, reason: 'LOCATION_INACTIVE' };
    }
    return { valid: true };
  } catch {
    return { valid: false, reason: 'LOCATION_INACTIVE' };
  }
}

/**
 * M1 compatibility helper — synchronous, takes a fetched ProductLocation record.
 *
 * Treats "NOT REGISTERED" (missing / null row) as "INACTIVE":
 *   - Returns true  if the row exists AND isActive === true
 *   - Returns false if the row is missing OR isActive === false
 *
 * Use this instead of checking row existence directly so that all callers
 * behave consistently regardless of whether a ProductLocation row exists.
 */
export function isProductActiveAtLocation(
  productLocation: { isActive: boolean } | null | undefined,
): boolean {
  return !!productLocation && productLocation.isActive === true;
}

/**
 * Deterministic check: is a product actively registered at a location?
 * Source of truth: ProductLocation table ONLY (isActive = true).
 * Never uses stock balances, ledger, or movement history.
 *
 * M1: returns false for both "no row" and "row with isActive=false" so that
 * missing registrations are treated exactly like inactive ones.
 */
export async function isProductRegisteredAtLocation(
  productId: string,
  locationId: string,
): Promise<boolean> {
  try {
    const mapping = await (prisma as any).productLocation.findFirst({
      where: { productId, locationId, isActive: true },
      select: { id: true },
    });
    return !!mapping;
  } catch {
    return false;
  }
}

/**
 * Check whether a product has an active mapping to a location
 * in the ProductLocation table.
 */
export async function validateProductActive(
  productId: string,
  locationId: string,
): Promise<ValidationResult> {
  try {
    const mapping = await (prisma as any).productLocation.findFirst({
      where: { productId, locationId, isActive: true },
    });
    if (!mapping) {
      return { valid: false, reason: 'PRODUCT_INACTIVE' };
    }
    return { valid: true };
  } catch {
    return { valid: false, reason: 'PRODUCT_INACTIVE' };
  }
}

/**
 * Return the ProductLocation status for a (productId, locationId) pair.
 * - isRegisteredNow: any ProductLocation row exists (active or inactive)
 * - isActiveNow:     the mapping exists AND isActive === true
 * Returns { isRegisteredNow: false, isActiveNow: false } on error or missing row.
 */
export async function getProductLocationStatus(
  productId: string,
  locationId: string,
): Promise<{ isRegisteredNow: boolean; isActiveNow: boolean }> {
  try {
    const mapping = await (prisma as any).productLocation.findFirst({
      where: { productId, locationId },
    });
    if (!mapping) return { isRegisteredNow: false, isActiveNow: false };
    return { isRegisteredNow: true, isActiveNow: mapping.isActive === true };
  } catch {
    return { isRegisteredNow: false, isActiveNow: false };
  }
}

/**
 * Return all products with an active ProductLocation mapping at the given location.
 * Used for dropdown filtering and "no products registered" warnings.
 * Returns an empty array if the location has no registered products or on error.
 */
export async function getRegisteredProductsAtLocation(
  locationId: string,
): Promise<Array<{ id: string; sku: string; name: string }>> {
  try {
    const mappings = await (prisma as any).productLocation.findMany({
      where:   { locationId, isActive: true },
      include: { product: { select: { id: true, sku: true, name: true } } },
    });
    return mappings.map((m: any) => m.product).filter(Boolean);
  } catch {
    return [];
  }
}

