import apiClient from '../../../api/client';

// ---------------------------------------------------------------------------
// Types — mirrors backend getStockOpnameReport() response shape
// ---------------------------------------------------------------------------
export interface StockOpnameItem {
  productId: string;
  sku: string;
  productName: string;
  uomCode: string;
  startingQty: number;
  inboundQty: number;
  outboundQty: number;
  systemQty: number;
  physicalQty: number | null;
  variance: number | null;
}

export interface StockOpnameCategory {
  categoryId: string;
  categoryName: string;
  items: StockOpnameItem[];
}

export interface StockOpnameLocation {
  locationId: string;
  locationCode: string;
  locationName: string;
  categories: StockOpnameCategory[];
}

export interface StockOpnameReport {
  generatedAt: string;
  filters: {
    startDate: string;
    endDate: string;
    locationIds: string[] | null;
    categoryIds: string[] | null;
  };
  locations: StockOpnameLocation[];
}

export interface StockOpnameFilters {
  startDate: string;
  endDate: string;
  locationIds?: string[];
  categoryIds?: string[];
}

export const reportService = {
  async getStockOpnameReport(filters: StockOpnameFilters): Promise<StockOpnameReport> {
    const query = new URLSearchParams();
    query.set('startDate', filters.startDate);
    query.set('endDate', filters.endDate);
    if (filters.locationIds?.length) {
      filters.locationIds.forEach((id) => query.append('locationIds', id));
    }
    if (filters.categoryIds?.length) {
      filters.categoryIds.forEach((id) => query.append('categoryIds', id));
    }
    const res = await apiClient.get<{ success: boolean; data: StockOpnameReport }>(
      `reports/stock-opname?${query.toString()}`,
    );
    return res.data.data;
  },
};

export default reportService;
