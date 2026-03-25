# Filters and Saved Presets

A guide to how filtering works across the inventory system — covering the UI model, state lifecycle, combination logic, filter chips, and saved presets.

---

## 1. Overview

The filter system is a shared, reusable pattern used across multiple modules (Stock, Products, Product Registrations). It supports two tiers of filtering:

- **Simple filters** — single-value dropdowns for quick, focused lookups
- **Advanced filters** — multi-select modal for cross-cutting queries

Both tiers produce the same internal filter state: arrays of IDs. This unified shape means the same state management hook, chip renderer, and API serialization layer work identically in every module.

Filters can be saved as named presets per user per module and reapplied in a single click.

---

## 2. Filter Types

### Simple Filters

Simple filters are single-select dropdowns rendered directly on the page toolbar. Each dropdown maps to a single category of filter (product, location, or category).

When a simple filter is applied, the selected value is converted into a **one-element array** before being committed to state. This means simple and advanced filters share the same state shape — there is no separate code path for "single value" vs "multiple values".

```
User selects: Location = "Warehouse A"
                    ↓
State becomes: locationIds = ["<uuid-of-warehouse-a>"]
```

Simple filters have a staging phase: the dropdown selection is held in local state and only committed when the user clicks **Apply**. Navigating away from the dropdown without applying discards the staged selection.

### Advanced Filters

Advanced filters are accessed via a modal. The modal presents a tabbed interface where each tab holds a searchable, scrollable multi-select list.

**Standard tabs (Stock / Product Registrations):**

| Tab | Filters |
|---|---|
| Categories | `categoryIds` — multi-select |
| Products | `productIds` — multi-select; automatically filtered by selected categories |
| Locations | `locationIds` — multi-select |

**Products module tabs:**

| Tab | Filters |
|---|---|
| Categories | `categoryIds` — multi-select |
| Vendors | `vendorIds` — multi-select |

**Behaviour inside the modal:**
- Each tab has a search box that filters the visible list in real time (case-insensitive)
- **Select All** and **Clear Selection** shortcuts are available per tab
- Products are dynamically narrowed to those belonging to the currently selected categories. If a category is later deselected, any products from that category that were already selected are automatically removed from the `productIds` selection
- The modal opens pre-populated with the currently applied filters (`initialFilters` prop)
- Changes take effect only when the user confirms with **Apply**; closing the modal without applying discards the in-progress selection

---

## 3. Filter Combination Logic

### Cross-type: AND

Different filter dimensions combine with **AND**. A result must satisfy all active filter dimensions simultaneously.

```
categoryIds = [A, B]  AND  locationIds = [C]  AND  productIds = [X, Y]
```

Only records that belong to category A or B, are at location C, and involve product X or Y are returned.

### Within-type: OR (IN query)

Multiple values within the same dimension match with **OR** via a SQL `IN` clause.

```
productIds = [X, Y]  →  WHERE productId IN ('X', 'Y')
```

A result matches if it involves **any** of the listed product IDs — not all of them.

### Combined example

```
GET /api/v1/stock
  ?categoryIds=cat-1&categoryIds=cat-2
  &locationIds=loc-a
  &productIds=prod-x&productIds=prod-y
  &startDate=2024-01-01&endDate=2024-03-31
```

Returns stock records where:
- product is in category `cat-1` **or** `cat-2`
- **AND** located at `loc-a`
- **AND** product is `prod-x` **or** `prod-y`
- **AND** within the date range

### No single-value / multi-value conflict

The system always operates on arrays internally. Simple dropdowns produce a 1-element array. The backend normalises any single UUID query param into an array before building the query. There is no distinction between "filtering by one product" and "filtering by many products" — the code path is identical.

If an endpoint that accepts both `productId` (legacy singular) and `productIds` (plural) receives both simultaneously, the backend merges them: `toArray(productIds ?? productId)`. The singular form is treated as a fallback only.

---

## 4. Filter State Behavior

### State shape

```typescript
type Filters = {
  categoryIds?: string[];
  productIds?:  string[];
  locationIds?: string[];
  vendorIds?:   string[];   // products module only
  startDate?:   string;     // YYYY-MM-DD
  endDate?:     string;     // YYYY-MM-DD
};
```

Undefined means "no filter on this dimension" — the backend treats it as match-all. An empty array `[]` is equivalent to undefined and produces no `IN` clause.

### Apply

Committing a filter (from either the simple dropdowns or the advanced modal) does two things:

1. Updates the applied `filters` state with the new values
2. Resets the current page to `0` (first page) to avoid showing stale paginated results

Only the dimension being updated changes — other active filters are preserved. For example, applying a new set of `locationIds` does not clear the currently active `categoryIds`.

### Clear All

Resets all filter dimensions to `undefined` simultaneously and resets to page `0`. Exposed as both a button in the toolbar and as a chip in the filter summary area.

### Removing a single filter chip

When a user removes an individual chip, only that specific ID is removed from its dimension's array. If removing it leaves an empty array, that dimension is set to `undefined` (no filter). Other dimensions are unaffected.

---

## 5. Filter Chips

`FilterSummaryChips` renders a horizontal strip of removable tags representing every currently active filter. It is driven entirely by the applied `filters` state and name-lookup maps.

### Display rules

| Active count per dimension | Rendered as |
|---|---|
| 0 | Nothing |
| 1 – 5 | Individual chips: `"Warehouse A ×"`, `"Widget SKU ×"` |
| 6+ | Aggregated chip: `"Locations: 8 selected ×"` |

Date range renders as a single chip: `"Date: 2024-01-01 → 2024-03-31 ×"`

### Removal behavior

- Removing an **individual chip** splices that ID out of the array. If the array becomes empty, the filter dimension is cleared.
- Removing an **aggregated chip** clears all selected IDs for that dimension at once.
- Removing the **date chip** clears both `startDate` and `endDate`.

### Props contract (for new module integrations)

```typescript
interface FilterSummaryChipsProps {
  categoryIds?:   string[];
  productIds?:    string[];
  locationIds?:   string[];
  startDate?:     string;
  endDate?:       string;
  categoriesMap:  Record<string, string>;   // id → display name
  productsMap:    Record<string, string>;
  locationsMap:   Record<string, string>;
  onRemoveCategory: (id: string) => void;
  onRemoveProduct:  (id: string) => void;
  onRemoveLocation: (id: string) => void;
  onClearDates:   () => void;
  onClearAll:     () => void;
}
```

The name-lookup maps must be provided by the consuming page — the component itself has no data-fetching logic.

---

## 6. Saved Filter Presets

### What gets saved

When a user saves a filter, the entire current `filters` state is serialised to JSON and sent to the backend:

```json
{
  "name": "East warehouses – widgets",
  "module": "STOCK",
  "filterJson": {
    "categoryIds": ["cat-uuid-1"],
    "productIds":  ["prod-uuid-a", "prod-uuid-b"],
    "locationIds": ["loc-uuid-east-1", "loc-uuid-east-2"]
  }
}
```

`filterJson` is a free-form JSON object — the backend stores it verbatim and returns it as-is. The frontend is responsible for interpreting its contents.

### Storage model

Presets are scoped to the authenticated user + module combination:

```
SavedFilter {
  id         UUID
  name       string
  module     string        -- e.g. "STOCK", "PRODUCTS", "PRODUCT_REGISTRATION"
  filterJson JSON
  createdBy  UUID          -- foreign key to user
  createdAt  timestamp
  updatedAt  timestamp
}
```

One user's saved filters in the STOCK module are invisible to other users and do not appear in the PRODUCTS module.

### Applying a saved preset

Applying a preset **fully replaces** the current filter state. It is not merged with existing filters.

```
Current state:  { locationIds: ["loc-1"] }
Apply preset:   { categoryIds: ["cat-2"], productIds: ["prod-3"] }
Result state:   { categoryIds: ["cat-2"], productIds: ["prod-3"] }
                   ↑ locationIds is gone — replaced, not merged
```

This is intentional: a preset represents a complete, self-contained filter configuration.

### API operations

```
GET    /api/v1/saved-filters?module=STOCK     → list all presets for this user + module
POST   /api/v1/saved-filters                  → create a new preset
DELETE /api/v1/saved-filters/:id              → delete a preset (owner only)
```

### Delete ownership

A user can only delete their own presets. Attempting to delete a preset belonging to another user returns `404 NOT_FOUND_ERROR` (the record is invisible, not forbidden — this avoids leaking existence).

---

## 7. Reusability Across Modules

### The `useAdvancedFilters` hook

All filter state management is encapsulated in a single reusable hook. Any new module that needs filtering should use this hook rather than re-implementing filter state from scratch.

```typescript
const {
  filters,              // Current applied filters (Filters type)
  applyCategoryFilter,  // (ids: string[] | undefined) => void
  applyProductFilter,   // (ids: string[] | undefined) => void
  applyLocationFilter,  // (ids: string[] | undefined) => void
  applyAdvancedFilters, // (filters: Filters) => void  — used by modal + saved presets
  clearFilters,         // () => void
  activeCount,          // number — total active filter dimensions (for badge)
} = useAdvancedFilters();
```

The hook has no knowledge of which module is using it. Module identity is only needed when loading/saving presets.

### Adding a new module

To add filtering to a new module:

1. **State**: call `useAdvancedFilters()` in the page component
2. **Simple filters**: add single-select dropdowns; on apply, call `applyProductFilter([id])` / `applyLocationFilter([id])`
3. **Advanced filter modal**: render `<AdvancedFilterModal>`, pass `filters` as `initialFilters`, call `applyAdvancedFilters(result)` on confirm
4. **Chips**: render `<FilterSummaryChips>` with the current `filters` and appropriate name-lookup maps
5. **Saved presets**: use `savedFiltersService.getAll('YOUR_MODULE')` for the dropdown; on apply call `applyAdvancedFilters(preset.filterJson)`; on save call `savedFiltersService.create({ name, module: 'YOUR_MODULE', filterJson: filters })`
6. **API call**: pass `filters.productIds`, `filters.locationIds`, etc. directly to your service function, which should serialise arrays as repeated query params

### Module filter configurations

| Module constant | Available filter dimensions |
|---|---|
| `STOCK` | `categoryIds`, `productIds`, `locationIds`, `startDate`, `endDate` |
| `PRODUCTS` | `search` (text), `categoryIds`, `vendorIds` |
| `PRODUCT_REGISTRATION` | `categoryIds`, `productIds`, `locationIds`, `status` |

Modules only need to provide UI controls and name-lookup maps for the dimensions they support — unused dimensions in the shared state simply remain `undefined` and are omitted from the API request.

### Backend contract for new modules

Any new endpoint that wants to accept array filters should:

1. Accept both singular (`productId`) and plural (`productIds`) forms in the Zod schema
2. Normalise to arrays before passing to the service layer using the `toArray` helper
3. Build Prisma `where` clauses using `{ in: ids }` for each dimension
4. Combine dimensions with spread syntax so absent dimensions produce no clause

```typescript
const where = {
  ...(productIds?.length  && { productId:  { in: productIds } }),
  ...(locationIds?.length && { locationId: { in: locationIds } }),
  ...(categoryIds?.length && { product: { categoryId: { in: categoryIds } } }),
};
```
