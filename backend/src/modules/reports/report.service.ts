import prisma from '../../config/database';

export interface StockOpnameParams {
  startDate: string;
  endDate: string;
  locationIds?: string[];
  categoryIds?: string[];
}

interface StockOpnameItem {
  productId: string;
  sku: string;
  productName: string;
  uomCode: string;
  startingQty: number;
  inboundQty: number;
  outboundQty: number;
  systemQty: number;
  physicalQty: null;
  variance: null;
}

interface StockOpnameCategory {
  categoryId: string;
  categoryName: string;
  items: StockOpnameItem[];
}

interface StockOpnameLocation {
  locationId: string;
  locationCode: string;
  locationName: string;
  categories: StockOpnameCategory[];
}

export async function getStockOpnameReport(params: StockOpnameParams) {
  const { startDate, endDate, locationIds, categoryIds } = params;

  // Normalize dates consistently with the rest of the codebase:
  //   startDate → 00:00:00.000 (start of day, local time)
  //   endDate   → 23:59:59.999 (end of day, local time)
  const startDateObj = new Date(startDate);
  const endDateObj   = new Date(endDate);
  endDateObj.setHours(23, 59, 59, 999);

  const hasLocationFilter = locationIds && locationIds.length > 0;
  const hasCategoryFilter = categoryIds && categoryIds.length > 0;

  // ---------------------------------------------------------------------------
  // STEP 1: Bulk fetch master data (products, locations, product-location links)
  // ---------------------------------------------------------------------------
  const [products, locations, productLocations] = await Promise.all([
    prisma.product.findMany({
      where: hasCategoryFilter ? { categoryId: { in: categoryIds } } : undefined,
      select: {
        id:         true,
        sku:        true,
        name:       true,
        categoryId: true,
        category:   { select: { id: true, name: true } },
        uom:        { select: { code: true } },
      },
    }),

    prisma.location.findMany({
      where: {
        isActive: true,
        ...(hasLocationFilter ? { id: { in: locationIds } } : {}),
      },
      select: { id: true, code: true, name: true },
    }),

    prisma.productLocation.findMany({
      where: {
        isActive: true,
        ...(hasLocationFilter ? { locationId: { in: locationIds } } : {}),
        ...(hasCategoryFilter
          ? { product: { categoryId: { in: categoryIds } } }
          : {}),
      },
      select: { productId: true, locationId: true },
    }),
  ]);

  // ---------------------------------------------------------------------------
  // STEP 2: Build lookup maps
  // ---------------------------------------------------------------------------
  const productMap     = new Map(products.map((p) => [p.id, p]));
  const locationMap    = new Map(locations.map((l) => [l.id, l]));
  const categoryNameMap = new Map(products.map((p) => [p.categoryId, p.category.name]));

  const effectiveLocationIds = locations.map((l) => l.id);
  const effectiveProductIds  = products.map((p) => p.id);

  // Guard: nothing to report when filters yield no results
  if (effectiveLocationIds.length === 0 || effectiveProductIds.length === 0) {
    return {
      generatedAt: new Date().toISOString(),
      filters: {
        startDate,
        endDate,
        locationIds: hasLocationFilter ? locationIds : null,
        categoryIds: hasCategoryFilter ? categoryIds : null,
      },
      locations: [],
    };
  }

  // ---------------------------------------------------------------------------
  // STEP 3: Query stockLedger — the single source of truth for ALL movement
  //         types: SEED, ADJUSTMENT, MOVEMENT_IN, MOVEMENT_OUT, TRANSFER_IN,
  //         TRANSFER_OUT.
  //
  //  (a) Entries with createdAt < startDate
  //        → last balanceAfter per (product, location) = startingQty
  //        Correct: stock at the very start of the period, before any
  //        transactions on startDate itself.
  //
  //  (b) Entries with startDate <= createdAt <= endDate
  //        → sum changeQty per (product, location) split into inbound / outbound
  // ---------------------------------------------------------------------------
  const ledgerScope = {
    locationId: { in: effectiveLocationIds },
    productId:  { in: effectiveProductIds },
  };

  const [ledgerBeforeStart, ledgerInPeriod] = await Promise.all([
    // (a) All entries strictly before the period start.
    //     Ordered desc so the first occurrence per key is the most-recent balance.
    (prisma as any).stockLedger.findMany({
      where: {
        ...ledgerScope,
        createdAt: { lt: startDateObj },
      },
      orderBy: { createdAt: 'desc' },
      select: { productId: true, locationId: true, balanceAfter: true },
    }) as Promise<Array<{ productId: string; locationId: string; balanceAfter: unknown }>>,

    // (b) All entries within the period (inclusive on both ends).
    (prisma as any).stockLedger.findMany({
      where: {
        ...ledgerScope,
        createdAt: { gte: startDateObj, lte: endDateObj },
      },
      select: { productId: true, locationId: true, changeQty: true },
    }) as Promise<Array<{ productId: string; locationId: string; changeQty: unknown }>>,
  ]);

  // startingQty map — take the first (most recent before startDate) per key.
  // If no entry exists before startDate, stock was 0 at that time.
  const startingQtyMap = new Map<string, number>();
  for (const entry of ledgerBeforeStart) {
    const key = `${entry.productId}:${entry.locationId}`;
    if (!startingQtyMap.has(key)) {
      startingQtyMap.set(key, Number(entry.balanceAfter));
    }
  }

  // Period inbound / outbound accumulators
  const periodAccMap = new Map<string, { inbound: number; outbound: number }>();
  for (const entry of ledgerInPeriod) {
    const key = `${entry.productId}:${entry.locationId}`;
    if (!periodAccMap.has(key)) {
      periodAccMap.set(key, { inbound: 0, outbound: 0 });
    }
    const acc = periodAccMap.get(key)!;
    const qty = Number(entry.changeQty);
    if (qty > 0) acc.inbound  += qty;
    else         acc.outbound += Math.abs(qty);
  }

  // ---------------------------------------------------------------------------
  // STEP 4: Build grouped report: locations → categories → items
  // ---------------------------------------------------------------------------
  const reportMap = new Map<string, Map<string, StockOpnameItem[]>>();

  for (const pl of productLocations) {
    const product  = productMap.get(pl.productId);
    const location = locationMap.get(pl.locationId);

    if (!product || !location) continue;
    if (hasCategoryFilter && !categoryIds!.includes(product.categoryId)) continue;

    const key     = `${pl.productId}:${pl.locationId}`;
    const round   = (n: number) => Math.round(n * 10000) / 10000;

    const startingQty = round(startingQtyMap.get(key) ?? 0);
    const periodAcc   = periodAccMap.get(key) ?? { inbound: 0, outbound: 0 };
    const inboundQty  = round(periodAcc.inbound);
    const outboundQty = round(periodAcc.outbound);
    const systemQty   = round(startingQty + inboundQty - outboundQty);

    // Temporary debug log — remove after verification
    console.log('CALC DEBUG:', {
      sku:          product.sku,
      locationCode: location.code,
      startingQty,
      inboundQty,
      outboundQty,
      systemQty,
    });

    const item: StockOpnameItem = {
      productId:   pl.productId,
      sku:         product.sku,
      productName: product.name,
      uomCode:     product.uom.code,
      startingQty,
      inboundQty,
      outboundQty,
      systemQty,
      physicalQty: null,
      variance:    null,
    };

    if (!reportMap.has(pl.locationId)) {
      reportMap.set(pl.locationId, new Map());
    }
    const catMap = reportMap.get(pl.locationId)!;
    if (!catMap.has(product.categoryId)) {
      catMap.set(product.categoryId, []);
    }
    catMap.get(product.categoryId)!.push(item);
  }

  // ---------------------------------------------------------------------------
  // STEP 5: Assemble final response structure
  // ---------------------------------------------------------------------------
  const reportLocations: StockOpnameLocation[] = [];

  for (const [locationId, catMap] of reportMap) {
    const location   = locationMap.get(locationId)!;
    const categories: StockOpnameCategory[] = [];
    for (const [categoryId, items] of catMap) {
      categories.push({
        categoryId,
        categoryName: categoryNameMap.get(categoryId) ?? 'Unknown',
        items,
      });
    }
    reportLocations.push({
      locationId,
      locationCode: location.code,
      locationName: location.name,
      categories,
    });
  }

  // ---------------------------------------------------------------------------
  // STEP 6: Summary log (mandatory)
  // ---------------------------------------------------------------------------
  const totalItems = reportLocations.reduce(
    (sum, loc) => sum + loc.categories.reduce((s, cat) => s + cat.items.length, 0),
    0,
  );

  console.log('STOCK OPNAME REPORT:', {
    locations:  reportLocations.length,
    totalItems,
    sample:     reportLocations[0]?.categories[0]?.items[0] ?? null,
  });

  return {
    generatedAt: new Date().toISOString(),
    filters: {
      startDate,
      endDate,
      locationIds: hasLocationFilter ? locationIds : null,
      categoryIds: hasCategoryFilter ? categoryIds : null,
    },
    locations: reportLocations,
  };
}
