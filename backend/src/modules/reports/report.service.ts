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

  const startDateObj = new Date(startDate);
  const endDateObj = new Date(endDate);
  endDateObj.setHours(23, 59, 59, 999);

  const hasLocationFilter = locationIds && locationIds.length > 0;
  const hasCategoryFilter = categoryIds && categoryIds.length > 0;

  // -------------------------------------------------------------------------
  // STEP 1: Bulk fetch all data in parallel — NO N+1 queries
  // -------------------------------------------------------------------------
  const [
    products,
    locations,
    productLocations,
    stockBalances,
    adjRequests,
    transferRequests,
  ] = await Promise.all([
    // Products with category + uom
    prisma.product.findMany({
      where: hasCategoryFilter ? { categoryId: { in: categoryIds } } : undefined,
      select: {
        id: true,
        sku: true,
        name: true,
        categoryId: true,
        category: { select: { id: true, name: true } },
        uom: { select: { code: true } },
      },
    }),

    // Active locations (optionally filtered)
    prisma.location.findMany({
      where: {
        isActive: true,
        ...(hasLocationFilter ? { id: { in: locationIds } } : {}),
      },
      select: { id: true, code: true, name: true },
    }),

    // Active product-location assignments
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

    // Current stock balances
    prisma.stockBalance.findMany({
      where: hasLocationFilter ? { locationId: { in: locationIds } } : undefined,
      select: { productId: true, locationId: true, onHandQty: true },
    }),

    // FINALIZED adjustment requests — only those finalized AFTER startDate
    // (we need movements after startDate to reconstruct startingQty)
    prisma.stockAdjustmentRequest.findMany({
      where: {
        status: 'FINALIZED',
        finalizedAt: { gt: startDateObj },
      },
      select: {
        finalizedAt: true,
        items: {
          select: { productId: true, locationId: true, qtyChange: true },
        },
      },
    }),

    // FINALIZED transfer requests — only those finalized AFTER startDate
    prisma.stockTransferRequest.findMany({
      where: {
        status: 'FINALIZED',
        finalizedAt: { gt: startDateObj },
      },
      select: {
        sourceLocationId: true,
        destinationLocationId: true,
        finalizedAt: true,
        items: {
          select: { productId: true, qty: true },
        },
      },
    }),
  ]);

  // -------------------------------------------------------------------------
  // STEP 2: Build lookup maps
  // -------------------------------------------------------------------------
  const productMap = new Map(products.map((p) => [p.id, p]));
  const locationMap = new Map(locations.map((l) => [l.id, l]));
  const categoryNameMap = new Map(products.map((p) => [p.categoryId, p.category.name]));

  // StockBalance: key = "productId:locationId" → number
  const balanceMap = new Map<string, number>();
  for (const sb of stockBalances) {
    balanceMap.set(`${sb.productId}:${sb.locationId}`, Number(sb.onHandQty));
  }

  // -------------------------------------------------------------------------
  // STEP 3: Build per-(product, location) movement accumulators
  //
  // We track:
  //   adjInboundAfterStart    — positive adjustments with finalizedAt > startDate
  //   adjOutboundAfterStart   — negative adjustments with finalizedAt > startDate (abs)
  //   adjInboundPeriod        — positive adjustments with startDate <= finalizedAt <= endDate
  //   adjOutboundPeriod       — negative adjustments (abs) within period
  //
  //   transferInboundAfterStart  / transferOutboundAfterStart
  //   transferInboundPeriod      / transferOutboundPeriod
  // -------------------------------------------------------------------------
  type MovAccum = {
    adjInboundAfterStart: number;
    adjOutboundAfterStart: number;
    adjInboundPeriod: number;
    adjOutboundPeriod: number;
    transferInboundAfterStart: number;
    transferOutboundAfterStart: number;
    transferInboundPeriod: number;
    transferOutboundPeriod: number;
  };

  const accumulators = new Map<string, MovAccum>();

  function getOrCreate(key: string): MovAccum {
    if (!accumulators.has(key)) {
      accumulators.set(key, {
        adjInboundAfterStart: 0,
        adjOutboundAfterStart: 0,
        adjInboundPeriod: 0,
        adjOutboundPeriod: 0,
        transferInboundAfterStart: 0,
        transferOutboundAfterStart: 0,
        transferInboundPeriod: 0,
        transferOutboundPeriod: 0,
      });
    }
    return accumulators.get(key)!;
  }

  // Process adjustment items
  for (const req of adjRequests) {
    const finalizedAt = req.finalizedAt!;
    // isAfterStart is always true because query filters finalizedAt > startDateObj
    const isAfterStart = true;
    const isInPeriod = finalizedAt >= startDateObj && finalizedAt <= endDateObj;

    for (const item of req.items) {
      const key = `${item.productId}:${item.locationId}`;
      const acc = getOrCreate(key);
      const qty = Number(item.qtyChange);

      if (isAfterStart) {
        if (qty > 0) acc.adjInboundAfterStart += qty;
        else acc.adjOutboundAfterStart += Math.abs(qty);
      }
      if (isInPeriod) {
        if (qty > 0) acc.adjInboundPeriod += qty;
        else acc.adjOutboundPeriod += Math.abs(qty);
      }
    }
  }

  // Process transfer items
  for (const req of transferRequests) {
    const finalizedAt = req.finalizedAt!;
    const isAfterStart = true;
    const isInPeriod = finalizedAt >= startDateObj && finalizedAt <= endDateObj;

    for (const item of req.items) {
      const qty = Number(item.qty);

      // Outbound from source location
      const sourceKey = `${item.productId}:${req.sourceLocationId}`;
      const sourceAcc = getOrCreate(sourceKey);
      if (isAfterStart) sourceAcc.transferOutboundAfterStart += qty;
      if (isInPeriod) sourceAcc.transferOutboundPeriod += qty;

      // Inbound to destination location
      const destKey = `${item.productId}:${req.destinationLocationId}`;
      const destAcc = getOrCreate(destKey);
      if (isAfterStart) destAcc.transferInboundAfterStart += qty;
      if (isInPeriod) destAcc.transferInboundPeriod += qty;
    }
  }

  // -------------------------------------------------------------------------
  // STEP 4: Build the grouped report: locations → categories → items
  // -------------------------------------------------------------------------
  // Map<locationId, Map<categoryId, StockOpnameItem[]>>
  const reportMap = new Map<string, Map<string, StockOpnameItem[]>>();

  for (const pl of productLocations) {
    const product = productMap.get(pl.productId);
    const location = locationMap.get(pl.locationId);

    // Skip if product/location not in our filtered sets
    if (!product || !location) continue;

    // Apply category filter (may be redundant due to DB filter, but defensive)
    if (hasCategoryFilter && !categoryIds!.includes(product.categoryId)) continue;

    const key = `${pl.productId}:${pl.locationId}`;
    const currentQty = balanceMap.get(key) ?? 0;

    const acc = accumulators.get(key) ?? {
      adjInboundAfterStart: 0,
      adjOutboundAfterStart: 0,
      adjInboundPeriod: 0,
      adjOutboundPeriod: 0,
      transferInboundAfterStart: 0,
      transferOutboundAfterStart: 0,
      transferInboundPeriod: 0,
      transferOutboundPeriod: 0,
    };

    // --- CORE CALCULATION ---
    const inboundAfterStart = acc.adjInboundAfterStart + acc.transferInboundAfterStart;
    const outboundAfterStart = acc.adjOutboundAfterStart + acc.transferOutboundAfterStart;

    // startingQty = stock before any movements after startDate
    const startingQty = currentQty - inboundAfterStart + outboundAfterStart;

    const inboundPeriod = acc.adjInboundPeriod + acc.transferInboundPeriod;
    const outboundPeriod = acc.adjOutboundPeriod + acc.transferOutboundPeriod;

    // systemQty = expected stock at end of endDate
    const systemQty = startingQty + inboundPeriod - outboundPeriod;

    // Sanity check
    if (startingQty < 0) {
      console.warn(`[StockOpname] Negative startingQty — sku=${product.sku} location=${location.code} startingQty=${startingQty} currentQty=${currentQty}`);
    }

    const round = (n: number) => Math.round(n * 10000) / 10000;

    const item: StockOpnameItem = {
      productId: pl.productId,
      sku: product.sku,
      productName: product.name,
      uomCode: product.uom.code,
      startingQty: round(startingQty),
      inboundQty: round(inboundPeriod),
      outboundQty: round(outboundPeriod),
      systemQty: round(systemQty),
      physicalQty: null,
      variance: null,
    };

    // Group by location → category
    if (!reportMap.has(pl.locationId)) {
      reportMap.set(pl.locationId, new Map());
    }
    const catMap = reportMap.get(pl.locationId)!;
    if (!catMap.has(product.categoryId)) {
      catMap.set(product.categoryId, []);
    }
    catMap.get(product.categoryId)!.push(item);
  }

  // -------------------------------------------------------------------------
  // STEP 5: Assemble final response structure
  // -------------------------------------------------------------------------
  const reportLocations: StockOpnameLocation[] = [];

  for (const [locationId, catMap] of reportMap) {
    const location = locationMap.get(locationId)!;

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

  // -------------------------------------------------------------------------
  // STEP 6: Debug log (mandatory)
  // -------------------------------------------------------------------------
  const totalItems = reportLocations.reduce(
    (sum, loc) => sum + loc.categories.reduce((s, cat) => s + cat.items.length, 0),
    0,
  );
  const firstItem = reportLocations[0]?.categories[0]?.items[0] ?? null;

  console.log('STOCK OPNAME REPORT:', {
    locations: reportLocations.length,
    totalItems,
    sample: firstItem,
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
