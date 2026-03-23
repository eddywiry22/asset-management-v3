import apiClient from '../api/client';

export type StockOverviewItem = {
  productId: string;
  productSku: string;
  productName: string;
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
    const { locationId, productId, startDate, endDate, page, limit } = params;
    const res = await apiClient.get<PaginatedResponse<StockOverviewItem>>('stock', {
      params: {
        page,
        limit,
        ...(locationId && { locationId }),
        ...(productId  && { productId }),
        ...(startDate  && { startDate }),
        ...(endDate    && { endDate }),
      },
    });
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
