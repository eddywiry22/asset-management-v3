import apiClient from '../api/client';

export type StockOverviewItem = {
  productId: string;
  productSku: string;
  productName: string;
  productCategoryName: string;
  uomCode: string;
  locationId: string;
  locationCode: string;
  locationName: string;
  locationIsActive: boolean;
  onHandQty: number;
  reservedQty: number;
  availableQty: number;
  startingQty: number;
  inboundQty: number;
  outboundQty: number;
  finalQty: number;
  pendingInbound: number;
  pendingOutbound: number;
  isRegisteredNow: boolean;
  isInactiveNow: boolean;
};

export type StockLedgerEntry = {
  id: string;
  productId: string;
  locationId: string;
  changeQty: number;
  balanceAfter: number;
  sourceType: 'ADJUSTMENT' | 'MOVEMENT_IN' | 'MOVEMENT_OUT' | 'SEED' | 'TRANSFER_IN' | 'TRANSFER_OUT';
  sourceId: string;
  createdAt: string;
  product: { id: string; sku: string; name: string };
  location: { id: string; code: string; name: string };
};

export type PaginatedResponse<T> = {
  success: boolean;
  data: T[];
  meta: { page: number; limit: number; total: number };
};

export type StockQueryParams = {
  locationId?: string;
  productId?: string;
  productIds?: string[];
  locationIds?: string[];
  categoryIds?: string[];
  page?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
};

export type LedgerQueryParams = {
  productId?: string;
  locationId?: string;
  page?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
};

export type VisibleLocation = { id: string; code: string; name: string; isActive?: boolean; role?: string };
export type RegisteredProduct = { id: string; sku: string; name: string };
export type ProductFilterOption = { id: string; sku: string; name: string; categoryId: string };

const stockService = {
  async getVisibleLocations(): Promise<VisibleLocation[]> {
    const res = await apiClient.get<{ success: boolean; data: VisibleLocation[] }>(
      'stock/locations',
    );
    return res.data.data;
  },

  async getRegisteredProducts(locationId: string): Promise<RegisteredProduct[]> {
    const res = await apiClient.get<{ success: boolean; data: RegisteredProduct[] }>(
      `stock/registered-products?locationId=${encodeURIComponent(locationId)}`,
    );
    return res.data.data;
  },

  async getFilterProducts(params: { categoryIds?: string[]; locationIds?: string[] } = {}): Promise<ProductFilterOption[]> {
    const { categoryIds, locationIds } = params;
    const query = new URLSearchParams();
    if (categoryIds?.length) {
      categoryIds.forEach(id => query.append('categoryIds', id));
    }
    if (locationIds?.length) {
      locationIds.forEach(id => query.append('locationIds', id));
    }
    const qs = query.toString();
    const res = await apiClient.get<{ success: boolean; data: ProductFilterOption[] }>(
      `stock/filter-products${qs ? `?${qs}` : ''}`,
    );
    return res.data.data;
  },

  async getAllLocations(): Promise<VisibleLocation[]> {
    const res = await apiClient.get<{ success: boolean; data: VisibleLocation[] }>(
      'stock/all-locations',
    );
    return res.data.data;
  },

  async getLocationReadiness(locationId: string): Promise<{
    hasOperator: boolean;
    hasManager: boolean;
    adjustmentReady: boolean;
    transferOutboundReady: boolean;
    transferInboundReady: boolean;
    overallStatus: 'FULL' | 'PARTIAL' | 'NONE';
  }> {
    const res = await apiClient.get(
      `stock/location-readiness?locationId=${encodeURIComponent(locationId)}`,
    );
    return res.data.data;
  },

  async getStockOverview(params: StockQueryParams = {}): Promise<PaginatedResponse<StockOverviewItem>> {
    const { locationId, productId, productIds, locationIds, categoryIds, startDate, endDate, page, limit } = params;
    const query = new URLSearchParams();
    if (page)       query.set('page',  String(page));
    if (limit)      query.set('limit', String(limit));
    if (startDate)  query.set('startDate', startDate);
    if (endDate)    query.set('endDate',   endDate);
    // Multi-select arrays (repeated params: productIds=a&productIds=b)
    if (productIds && productIds.length > 0) {
      productIds.forEach(id => query.append('productIds', id));
    } else if (productId) {
      query.set('productId', productId);
    }
    if (locationIds && locationIds.length > 0) {
      locationIds.forEach(id => query.append('locationIds', id));
    } else if (locationId) {
      query.set('locationId', locationId);
    }
    if (categoryIds && categoryIds.length > 0) {
      categoryIds.forEach(id => query.append('categoryIds', id));
    }
    const res = await apiClient.get<PaginatedResponse<StockOverviewItem>>(`stock?${query.toString()}`);
    return res.data;
  },

  async getLedger(params: LedgerQueryParams = {}): Promise<PaginatedResponse<StockLedgerEntry>> {
    const query = new URLSearchParams();
    if (params.productId)  query.set('productId',  params.productId);
    if (params.locationId) query.set('locationId', params.locationId);
    if (params.page)       query.set('page',       String(params.page));
    if (params.limit)      query.set('limit',      String(params.limit));
    if (params.startDate)  query.set('startDate',  params.startDate);
    if (params.endDate)    query.set('endDate',    params.endDate);
    const res = await apiClient.get<PaginatedResponse<StockLedgerEntry>>(
      `stock/ledger?${query.toString()}`,
    );
    return res.data;
  },
};

export default stockService;
