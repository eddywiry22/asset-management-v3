import { useState } from 'react';

type Filters = {
  categoryIds?: string[];
  productIds?: string[];
  locationIds?: string[];
};

export function useAdvancedFilters(initial?: Filters) {
  const [filters, setFilters] = useState<Filters>(initial ?? {});

  /**
   * Set category filter. Optionally pass allProducts to auto-clean any
   * previously selected productIds that no longer belong to the new categories.
   */
  const applyCategoryFilter = (
    ids?: string[],
    allProducts?: Array<{ id: string; categoryId: string }>,
  ) => {
    setFilters(prev => ({
      ...prev,
      categoryIds: ids && ids.length > 0 ? ids : undefined,
      // Remove products that don't belong to the new category selection
      productIds: ids?.length && allProducts
        ? prev.productIds?.filter(pid =>
            allProducts.some(p => p.id === pid && ids.includes(p.categoryId))
          )
        : prev.productIds,
    }));
  };

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
    categoryIds: string[];
    productIds: string[];
    locationIds: string[];
  }) => {
    setFilters({
      categoryIds: data.categoryIds.length > 0 ? data.categoryIds : undefined,
      productIds:  data.productIds.length  > 0 ? data.productIds  : undefined,
      locationIds: data.locationIds.length > 0 ? data.locationIds : undefined,
    });
  };

  const clearFilters = () => {
    setFilters({});
  };

  const activeCount =
    (filters.categoryIds?.length ?? 0) +
    (filters.productIds?.length  ?? 0) +
    (filters.locationIds?.length ?? 0);

  return {
    filters,
    applyCategoryFilter,
    applyProductFilter,
    applyLocationFilter,
    applyAdvancedFilters,
    clearFilters,
    activeCount,
  };
}
