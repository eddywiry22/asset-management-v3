import { Button, Chip, Stack } from '@mui/material';

interface FilterSummaryChipsProps {
  productIds?: string[];
  locationIds?: string[];
  startDate?: string;
  endDate?: string;
  productsMap: Record<string, string>;
  locationsMap: Record<string, string>;
  onRemoveProduct: (id: string) => void;
  onRemoveLocation: (id: string) => void;
  onClearDates: () => void;
  onClearAll: () => void;
}

const MAX_INDIVIDUAL_CHIPS = 5;

export default function FilterSummaryChips({
  productIds = [],
  locationIds = [],
  startDate,
  endDate,
  productsMap,
  locationsMap,
  onRemoveProduct,
  onRemoveLocation,
  onClearDates,
  onClearAll,
}: FilterSummaryChipsProps) {
  const hasProducts  = productIds.length > 0;
  const hasLocations = locationIds.length > 0;
  const hasDates     = !!(startDate || endDate);

  if (!hasProducts && !hasLocations && !hasDates) return null;

  const dateLabel = [startDate, endDate].filter(Boolean).join(' → ');

  return (
    <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 2, alignItems: 'center', gap: 1 }}>
      {/* Product chips */}
      {hasProducts && productIds.length > MAX_INDIVIDUAL_CHIPS ? (
        <Chip
          size="small"
          label={`Products: ${productIds.length} selected`}
          onDelete={onClearAll}
        />
      ) : (
        productIds.map((id) => (
          <Chip
            key={id}
            size="small"
            label={`Product: ${productsMap[id] ?? id}`}
            onDelete={() => onRemoveProduct(id)}
          />
        ))
      )}

      {/* Location chips */}
      {hasLocations && locationIds.length > MAX_INDIVIDUAL_CHIPS ? (
        <Chip
          size="small"
          label={`Locations: ${locationIds.length} selected`}
          onDelete={() => onClearAll()}
        />
      ) : (
        locationIds.map((id) => (
          <Chip
            key={id}
            size="small"
            label={`Location: ${locationsMap[id] ?? id}`}
            onDelete={() => onRemoveLocation(id)}
          />
        ))
      )}

      {/* Date chip */}
      {hasDates && (
        <Chip
          size="small"
          label={`Date: ${dateLabel}`}
          onDelete={onClearDates}
        />
      )}

      <Button size="small" onClick={onClearAll}>
        Clear All
      </Button>
    </Stack>
  );
}
