import { useState } from 'react';

type Filters = {
  productIds?: string[];
  locationIds?: string[];
};

export function useAdvancedFilters(initial?: Filters) {
  const [filters, setFilters] = useState<Filters>(initial ?? {});

  const applyProductFilter = (ids?: string[]) => {
    setFilters(prev => ({
      ...prev,
      productIds: ids && ids.length > 0 ? ids : undefined,
    }));
  };

  const applyLocationFilter = (ids?: string[]) => {
    setFilters(prev => ({
      ...prev,
      locationIds: ids && ids.length > 0 ? ids : undefined,
    }));
  };

  const applyAdvancedFilters = (data: {
    productIds: string[];
    locationIds: string[];
  }) => {
    setFilters({
      productIds:  data.productIds.length  > 0 ? data.productIds  : undefined,
      locationIds: data.locationIds.length > 0 ? data.locationIds : undefined,
    });
  };

  const clearFilters = () => {
    setFilters({});
  };

  const activeCount =
    (filters.productIds?.length  ?? 0) +
    (filters.locationIds?.length ?? 0);

  return {
    filters,
    applyProductFilter,
    applyLocationFilter,
    applyAdvancedFilters,
    clearFilters,
    activeCount,
  };
}
