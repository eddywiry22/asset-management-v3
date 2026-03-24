import { useState } from 'react';

type Filters = {
  productId?: string;
  locationId?: string;
  productIds?: string[];
  locationIds?: string[];
};

export function useAdvancedFilters(initial?: Filters) {
  const [filters, setFilters] = useState<Filters>(initial ?? {});

  const applySimpleFilters = (productId?: string, locationId?: string) => {
    setFilters({
      productId,
      locationId,
      productIds: undefined,
      locationIds: undefined,
    });
  };

  const applyAdvancedFilters = (data: {
    productIds: string[];
    locationIds: string[];
  }) => {
    setFilters({
      productIds: data.productIds,
      locationIds: data.locationIds,
      productId: undefined,
      locationId: undefined,
    });
  };

  const clearFilters = () => {
    setFilters({});
  };

  const activeCount =
    (filters.productId ? 1 : 0) +
    (filters.locationId ? 1 : 0) +
    (filters.productIds?.length ?? 0) +
    (filters.locationIds?.length ?? 0);

  return {
    filters,
    applySimpleFilters,
    applyAdvancedFilters,
    clearFilters,
    activeCount,
  };
}
