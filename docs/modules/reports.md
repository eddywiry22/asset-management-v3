# Reports Module

The reports module generates the **Stock Opname** report — a point-in-time view of stock quantities per product per location over a selected date range. It is read-only and has no side effects.

---

## Table of Contents

1. [Purpose](#1-purpose)
2. [API Reference](#2-api-reference)
3. [How Quantities Are Calculated](#3-how-quantities-are-calculated)
4. [Frontend Integration](#4-frontend-integration)
5. [Do / Don't](#5-do--dont)
6. [Known Limitations](#6-known-limitations)
7. [Cross-Module Relationships](#7-cross-module-relationships)

---

## 1. Purpose

The Stock Opname report supports physical inventory count events. It shows:

- **`startingQty`** — stock at the beginning of the period
- **`inboundQty`** — total stock received during the period
- **`outboundQty`** — total stock dispatched during the period
- **`systemQty`** — calculated stock at the end of the period
- **`physicalQty`** / **`variance`** — reserved for physical count entry (always `null` from the API)

Results are grouped hierarchically: **location → category → product**.

---

## 2. API Reference

### Get Stock Opname report

```
GET /api/v1/reports/stock-opname
Authorization: Bearer <token>
```

**Query parameters:**

| Param | Type | Required | Description |
|-------|------|:--------:|-------------|
| `startDate` | `YYYY-MM-DD` | **Yes** | Start of reporting period |
| `endDate` | `YYYY-MM-DD` | **Yes** | End of reporting period |
| `locationIds` | UUID (repeatable) | No | Filter to specific locations. Omit for all active locations. |
| `categoryIds` | UUID (repeatable) | No | Filter to specific categories. Omit for all. |

Repeat parameters for multi-value filters:

```
GET /api/v1/reports/stock-opname
  ?startDate=2024-01-01
  &endDate=2024-01-31
  &locationIds=<uuid-a>
  &locationIds=<uuid-b>
  &categoryIds=<uuid-c>
```

Or comma-separated (the controller normalizes both forms):

```
GET /api/v1/reports/stock-opname?startDate=2024-01-01&endDate=2024-01-31&locationIds=<uuid-a>,<uuid-b>
```

**Validation errors (400):**
- `startDate` or `endDate` missing or not a valid date string.
- `startDate` is after `endDate`.

**Response:**

```json
{
  "success": true,
  "data": {
    "generatedAt": "2024-02-01T08:00:00.000Z",
    "filters": {
      "startDate":   "2024-01-01",
      "endDate":     "2024-01-31",
      "locationIds": ["<uuid-a>", "<uuid-b>"],
      "categoryIds": null
    },
    "locations": [
      {
        "locationId":   "<uuid>",
        "locationCode": "WH-01",
        "locationName": "Warehouse 01",
        "categories": [
          {
            "categoryId":   "<uuid>",
            "categoryName": "Electronics",
            "items": [
              {
                "productId":   "<uuid>",
                "sku":         "ELEC-001",
                "productName": "Widget A",
                "uomCode":     "PCS",
                "startingQty": 100,
                "inboundQty":  50,
                "outboundQty": 30,
                "systemQty":   120,
                "physicalQty": null,
                "variance":    null
              }
            ]
          }
        ]
      }
    ]
  }
}
```

**Empty result:** If the filters match no active locations or products, `locations` is an empty array. No error is returned.

---

## 3. How Quantities Are Calculated

All calculations read from **`StockLedger`**, not `StockBalance`. This ensures historically accurate values even if `StockBalance` was modified out-of-band.

### Date normalization

| Input | Normalized to |
|-------|--------------|
| `startDate` | `YYYY-MM-DD 00:00:00.000` |
| `endDate` | `YYYY-MM-DD 23:59:59.999` |

### `startingQty`

The `balanceAfter` value from the **most recent** `StockLedger` entry where `createdAt < startDate` for that `(productId, locationId)` pair.

```
startingQty = most recent ledger entry before startDate → balanceAfter
            = 0 if no such entry exists
```

### `inboundQty` and `outboundQty`

Accumulated from ledger entries where `startDate ≤ createdAt ≤ endDate`:

```
inboundQty  = SUM of changeQty where changeQty > 0
outboundQty = SUM of |changeQty| where changeQty < 0
```

### `systemQty`

```
systemQty = startingQty + inboundQty - outboundQty
```

This is a computed value — it is not read from any table.

### Which transactions are included

All finalized transactions that produced a `StockLedger` entry are included, regardless of source type:

| `sourceType` | Produced by |
|-------------|------------|
| `ADJUSTMENT` | Finalized adjustment request |
| `TRANSFER_IN` | Finalized transfer — destination side |
| `TRANSFER_OUT` | Finalized transfer — origin side |
| `SEED` | Initial stock seeding |
| `MOVEMENT_IN` / `MOVEMENT_OUT` | Future use |

> Only **finalized** transactions affect stock and therefore appear in the ledger. Pending, approved, cancelled, or rejected requests have no effect on reported quantities.

### Rounding

All quantities are rounded to 4 decimal places (`Math.round(n * 10000) / 10000`) before inclusion in the response.

---

## 4. Frontend Integration

### Flow

1. User opens **Stock Opname Report** modal (triggered from wherever the report button is placed).
2. Modal renders `StockOpnameFilters` — date range (required), locations (optional multi-select), categories (optional multi-select).
3. User clicks **Preview** → calls `fetchReport()` → `GET /api/v1/reports/stock-opname`.
4. Report data populates `StockOpnamePreview` inside a scrollable area.
5. User clicks **Print** → `window.print()` — prints the current preview using browser print functionality.
6. Closing the modal resets all state (filters back to today's date, report data cleared).

### Components and hooks

| File | Responsibility |
|------|---------------|
| `StockOpnameReportModal.tsx` | Modal shell; loads location/category options; coordinates filters ↔ preview ↔ print |
| `StockOpnameFilters` | Filter form (date range + multi-selects) |
| `StockOpnamePreview` | Renders the hierarchical report table |
| `useStockOpnameReport` hook | Manages `loading`, `error`, `data` state; calls `reportService.getStockOpnameReport()` |
| `report.service.ts` | Builds query string and calls the API |

### `useStockOpnameReport` hook

```typescript
const { data, loading, error, fetchReport, reset } = useStockOpnameReport();

// Fetch:
await fetchReport({
  startDate:   '2024-01-01',
  endDate:     '2024-01-31',
  locationIds: ['<uuid-a>'],   // optional
  categoryIds: ['<uuid-b>'],   // optional
});

// data: StockOpnameReport | null
// loading: boolean
// error: string | null
// reset(): clears data and error
```

### Print behavior

Print is triggered by `window.print()`. It prints the rendered HTML inside `<div id="print-area">`. Print layout is controlled by CSS — the modal chrome (filters bar, close button) should be hidden via `@media print` rules. Do not add backend PDF generation unless requirements change.

### Location options

The modal loads locations via `stockService.getVisibleLocations()` — this returns only the locations visible to the current user (based on their `UserLocationRole` assignments, or all locations for admins). The report API itself does not further restrict by user — location-level visibility is a UI concern only.

---

## 5. Do / Don't

| | |
|---|---|
| ✅ | Use `window.print()` for export — the preview IS the print layout |
| ✅ | Pass `locationIds` / `categoryIds` as repeated query params or comma-separated |
| ✅ | Treat `physicalQty` and `variance` as always `null` from the API — they are reserved fields |
| ✅ | Use `startingQty` as "stock at the start of the period" and `systemQty` as "stock at the end" |
| ✅ | Expect an empty `locations` array (not an error) when filters match nothing |
| ❌ | Don't use `StockBalance.onHandQty` as a substitute for `systemQty` — they may differ for historical periods |
| ❌ | Don't assume `startingQty ≥ 0` — it can be negative if the ledger had a negative balance at the boundary |
| ❌ | Don't add PDF generation on the backend without first confirming this is a product requirement |
| ❌ | Don't add server-side user-visibility filtering to the report API — that is handled by the UI |

---

## 6. Known Limitations

- **`physicalQty` and `variance` are not populated.** These fields exist in the response shape for future physical count entry functionality but are always `null`.
- **Large datasets may be slow.** The service does two `StockLedger` queries (one for all entries before `startDate`, one for the period) and then joins in memory. Reports spanning many locations, products, and a long date range may be slow with high ledger volume.
- **Browser print layout depends on CSS.** If the page CSS does not include `@media print` rules to hide non-report elements, the print output will include the modal chrome.
- **Inactive product-location registrations are excluded.** If a product was deregistered from a location after transactions were recorded, it will not appear in new reports, even though historical stock movements exist in the ledger.
- **No data means `startingQty = 0`.** If a product-location has no ledger history before `startDate`, its `startingQty` is `0`. This may understate stock for products seeded outside the system.

---

## 7. Cross-Module Relationships

- **StockLedger:** The sole data source for all quantity calculations. Only entries created by finalization of adjustment or transfer requests appear here.
- **StockAdjustmentRequest / StockTransferRequest:** Finalization writes `StockLedger` entries which are then reflected in the report. The report itself does not query these tables.
- **StockBalance:** Not used for report calculations. `StockBalance.onHandQty` reflects the current live state, not historical values.
- **ProductLocation:** Used to determine which `(product, location)` pairs to include. Only `isActive: true` registrations are included.
- **Timeline / Comments / Attachments:** No relationship — the reports module operates entirely independently of the activity timeline.
