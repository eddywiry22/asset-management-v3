import { useState, useMemo } from "react";
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
  Paper,
  CircularProgress,
  Alert,
  Tooltip,
  Snackbar,
  Toolbar,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import FilterListIcon from "@mui/icons-material/FilterList";
import BookmarkBorderIcon from "@mui/icons-material/BookmarkBorder";
import DeleteIcon from "@mui/icons-material/Delete";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  productRegistrationsService,
  ProductRegistration,
} from "../../../services/productRegistrations.service";
import { productsService } from "../../../services/products.service";
import stockService from "../../../services/stock.service";
import AdvancedFilterModal from "../../../components/AdvancedFilterModal";
import SaveFilterModal from "../../../components/SaveFilterModal";
import { useAdvancedFilters } from "../../../hooks/useAdvancedFilters";
import { savedFiltersService } from "../../../services/savedFilters.service";
import { categoriesService } from "../../../services/categories.service";

const createSchema = z.object({
  productId: z.string().min(1, "Product is required"),
  locationId: z.string().min(1, "Location is required"),
  isActive: z.boolean().optional(),
});

const editSchema = z.object({
  isActive: z.boolean(),
});

type CreateForm = z.infer<typeof createSchema>;
type EditForm = z.infer<typeof editSchema>;

const MAX_CHIPS = 5;

export default function ProductRegistrationsPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ProductRegistration | null>(
    null,
  );
  const [apiError, setApiError] = useState("");

  // Pagination (MUI TablePagination uses 0-based page)
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  // Advanced filters (productIds / locationIds via reusable hook)
  const {
    filters,
    applyCategoryFilter,
    applyProductFilter,
    applyLocationFilter,
    applyAdvancedFilters,
    clearFilters,
    activeCount,
  } = useAdvancedFilters();

  // Simple filter staging state (dropdowns before Apply is clicked)
  // filterCategoryId is derived from the hook so simple dropdown + advanced modal stay in sync
  const filterCategoryId = filters.categoryIds?.[0] ?? "";
  const [filterProductId, setFilterProductId] = useState("");
  const [filterLocationId, setFilterLocationId] = useState("");

  // Status filter — applied immediately on change
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "ACTIVE" | "INACTIVE"
  >("ALL");

  // Modal visibility
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [openSave, setOpenSave] = useState(false);
  const [savedFilterAnchor, setSavedFilterAnchor] = useState("");

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkConfirm, setBulkConfirm] = useState<{ isActive: boolean } | null>(
    null,
  );

  // Toast
  const [snack, setSnack] = useState<{
    msg: string;
    severity: "success" | "warning" | "error";
  } | null>(null);

  // ── Data fetches ────────────────────────────────────────────────────────────

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: categoriesService.getAll,
  });

  const { data: productsResponse } = useQuery({
    queryKey: ["products"],
    queryFn: () => productsService.getAll(),
  });
  const products = productsResponse?.data ?? [];

  const { data: locations = [] } = useQuery({
    queryKey: ["all-locations"],
    queryFn: stockService.getAllLocations,
  });

  const { data: savedFilters = [] } = useQuery({
    queryKey: ["saved-filters", "PRODUCT_REGISTRATION"],
    queryFn: () => savedFiltersService.getAll("PRODUCT_REGISTRATION"),
  });

  // Lookup maps for filter chips
  const productsMap = useMemo(() => {
    const map: Record<string, string> = {};
    products.forEach((p) => {
      map[p.id] = `${p.sku} — ${p.name}`;
    });
    return map;
  }, [products]);

  const locationsMap = useMemo(() => {
    const map: Record<string, string> = {};
    locations.forEach((l) => {
      map[l.id] = `${l.code} — ${l.name}`;
    });
    return map;
  }, [locations]);

  // Filter product list by selected categories (supports multi-category from advanced filter)
  const filteredProducts = useMemo(() => {
    if (!filters.categoryIds?.length) return products;
    return products.filter((p) => filters.categoryIds!.includes(p.categoryId));
  }, [products, filters.categoryIds]);

  // Main table query — combines hook filters + status + category
  const { data, isLoading, error } = useQuery({
    queryKey: [
      "product-registrations",
      page,
      rowsPerPage,
      filters,
      statusFilter,
    ],
    queryFn: () =>
      productRegistrationsService.getAll({
        page: page + 1,
        pageSize: rowsPerPage,
        status: statusFilter,
        ...(filters.productIds?.length && { productIds: filters.productIds }),
        ...(filters.locationIds?.length && {
          locationIds: filters.locationIds,
        }),
        ...(filters.categoryIds?.length && {
          categoryIds: filters.categoryIds,
        }),
      }),
  });

  const registrations = data?.data ?? [];
  const total = data?.meta?.total ?? 0;

  // ── Forms ───────────────────────────────────────────────────────────────────

  const createForm = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { isActive: true },
  });
  const editForm = useForm<EditForm>({ resolver: zodResolver(editSchema) });

  // ── Mutations ───────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: productRegistrationsService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product-registrations"] });
      setCreateOpen(false);
      createForm.reset();
      setApiError("");
    },
    onError: (err: any) => {
      setApiError(
        err?.response?.data?.error?.message ?? "Failed to create registration",
      );
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: EditForm }) =>
      productRegistrationsService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product-registrations"] });
      setEditTarget(null);
      setApiError("");
    },
    onError: (err: any) => {
      setApiError(
        err?.response?.data?.error?.message ?? "Failed to update registration",
      );
    },
  });

  const bulkToggleMutation = useMutation({
    mutationFn: ({ ids, isActive }: { ids: string[]; isActive: boolean }) =>
      productRegistrationsService.bulkToggle(ids, isActive),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["product-registrations"] });
      setSelectedIds([]);
      setBulkConfirm(null);
      const { successCount, failed } = result;
      if (successCount === 0) {
        setSnack({
          msg: "No items updated (all blocked by active requests)",
          severity: "warning",
        });
      } else if (failed.length === 0) {
        setSnack({
          msg: `${successCount} item${successCount !== 1 ? "s" : ""} updated successfully`,
          severity: "success",
        });
      } else {
        setSnack({
          msg: `${successCount} updated, ${failed.length} skipped (in use)`,
          severity: "warning",
        });
      }
    },
    onError: (err: any) => {
      setBulkConfirm(null);
      setSnack({
        msg: err?.response?.data?.error?.message ?? "Bulk toggle failed",
        severity: "error",
      });
    },
  });

  const saveMutation = useMutation({
    mutationFn: (name: string) =>
      savedFiltersService.create({
        name,
        module: "PRODUCT_REGISTRATION",
        filterJson: {
          categoryIds: filters.categoryIds,
          productIds: filters.productIds,
          locationIds: filters.locationIds,
          status: statusFilter,
        } as Record<string, unknown>,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["saved-filters", "PRODUCT_REGISTRATION"],
      });
      setOpenSave(false);
      setSnack({ msg: "Filter saved", severity: "success" });
    },
  });

  const deleteSavedMutation = useMutation({
    mutationFn: (id: string) => savedFiltersService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["saved-filters", "PRODUCT_REGISTRATION"],
      });
      setSnack({ msg: "Filter deleted", severity: "success" });
    },
  });

  // Pre-check pending requests when the edit dialog opens for an active registration
  const { data: deactivationCheck } = useQuery({
    queryKey: ["check-deactivate", editTarget?.id],
    queryFn: () =>
      productRegistrationsService.checkDeactivation(editTarget!.id),
    enabled: !!editTarget && editTarget.isActive,
  });

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const openEdit = (item: ProductRegistration) => {
    setEditTarget(item);
    editForm.reset({ isActive: item.isActive });
    setApiError("");
  };

  const onCreateSubmit = (data: CreateForm) => {
    setApiError("");
    createMutation.mutate(data);
  };

  const onEditSubmit = (data: EditForm) => {
    if (!editTarget) return;
    setApiError("");
    updateMutation.mutate({ id: editTarget.id, data });
  };

  const handleCategoryChange = (value: string) => {
    applyCategoryFilter(value ? [value] : undefined, products);
    setFilterProductId("");
    setPage(0);
  };

  // Apply simple dropdown filters
  const handleApplySimple = () => {
    applyProductFilter(filterProductId ? [filterProductId] : undefined);
    applyLocationFilter(filterLocationId ? [filterLocationId] : undefined);
    setPage(0);
    setSelectedIds([]);
  };

  // Reset everything
  const handleClearAll = () => {
    clearFilters();
    setFilterProductId("");
    setFilterLocationId("");
    setStatusFilter("ALL");
    setPage(0);
    setSelectedIds([]);
    setSavedFilterAnchor("");
  };

  const handleRemoveProduct = (id: string) => {
    applyProductFilter(filters.productIds?.filter((p) => p !== id));
  };

  const handleRemoveLocation = (id: string) => {
    applyLocationFilter(filters.locationIds?.filter((l) => l !== id));
  };

  const handleApplySavedFilter = (filterId: string) => {
    const saved = savedFilters.find((f) => f.id === filterId);
    if (!saved) return;
    const fj = saved.filterJson as {
      categoryIds?: string[];
      productIds?: string[];
      locationIds?: string[];
      status?: "ALL" | "ACTIVE" | "INACTIVE";
    };
    applyAdvancedFilters({
      categoryIds: fj.categoryIds ?? [],
      productIds: fj.productIds ?? [],
      locationIds: fj.locationIds ?? [],
    });
    setStatusFilter(fj.status ?? "ALL");
    setPage(0);
    setSavedFilterAnchor("");
  };

  const handlePageChange = (_e: unknown, p: number) => {
    setPage(p);
    setSelectedIds([]);
  };

  const handleRowsPerPageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(e.target.value, 10));
    setPage(0);
    setSelectedIds([]);
  };

  // Bulk selection helpers
  const allPageSelected =
    registrations.length > 0 &&
    registrations.every((r) => selectedIds.includes(r.id));
  const somePageSelected =
    registrations.some((r) => selectedIds.includes(r.id)) && !allPageSelected;

  const handleSelectAll = () => {
    if (allPageSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(registrations.map((r) => r.id));
    }
  };

  const handleSelectRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleBulkAction = (isActive: boolean) => setBulkConfirm({ isActive });

  const onBulkConfirm = () => {
    if (!bulkConfirm) return;
    bulkToggleMutation.mutate({
      ids: selectedIds,
      isActive: bulkConfirm.isActive,
    });
  };

  const hasFilters =
    (filters.categoryIds?.length ?? 0) > 0 ||
    (filters.productIds?.length ?? 0) > 0 ||
    (filters.locationIds?.length ?? 0) > 0 ||
    statusFilter !== "ALL";

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 2,
        }}
      >
        <Typography variant="h5">Product Registrations</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => {
            setCreateOpen(true);
            setApiError("");
          }}
        >
          Register Product
        </Button>
      </Box>

      {/* ── Filter Bar ─────────────────────────────────────────────────────── */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box
          sx={{
            display: "flex",
            gap: 2,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Category</InputLabel>
            <Select
              label="Category"
              value={filterCategoryId}
              onChange={(e: SelectChangeEvent) =>
                handleCategoryChange(e.target.value)
              }
            >
              <MenuItem value="">All Categories</MenuItem>
              {categories.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Product</InputLabel>
            <Select
              label="Product"
              value={filterProductId}
              onChange={(e: SelectChangeEvent) =>
                setFilterProductId(e.target.value)
              }
            >
              <MenuItem value="">All Products</MenuItem>
              {filteredProducts.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.sku} — {p.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Location</InputLabel>
            <Select
              label="Location"
              value={filterLocationId}
              onChange={(e: SelectChangeEvent) =>
                setFilterLocationId(e.target.value)
              }
            >
              <MenuItem value="">All Locations</MenuItem>
              {locations.map((l) => (
                <MenuItem key={l.id} value={l.id}>
                  {l.code} — {l.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Status</InputLabel>
            <Select
              label="Status"
              value={statusFilter}
              onChange={(e: SelectChangeEvent) => {
                setStatusFilter(
                  e.target.value as "ALL" | "ACTIVE" | "INACTIVE",
                );
                setPage(0);
                setSelectedIds([]);
              }}
            >
              <MenuItem value="ALL">All</MenuItem>
              <MenuItem value="ACTIVE">Active</MenuItem>
              <MenuItem value="INACTIVE">Inactive</MenuItem>
            </Select>
          </FormControl>

          <Box sx={{ display: "flex", gap: 1 }}>
            <Button variant="contained" onClick={handleApplySimple}>
              Apply
            </Button>
            <Button variant="text" onClick={handleClearAll}>
              Clear
            </Button>
          </Box>

          <Button
            variant="outlined"
            startIcon={<FilterListIcon />}
            onClick={() => setFilterModalOpen(true)}
          >
            Advanced Filter{activeCount > 0 ? ` (${activeCount})` : ""}
          </Button>

          <Button
            variant="outlined"
            startIcon={<BookmarkBorderIcon />}
            disabled={!hasFilters}
            onClick={() => setOpenSave(true)}
          >
            Save Filter
          </Button>

          {/* Saved Filters Dropdown */}
          <FormControl sx={{ minWidth: 180 }} size="small">
            <InputLabel>Saved Filters</InputLabel>
            <Select
              value={savedFilterAnchor}
              label="Saved Filters"
              onChange={(e) => {
                const val = e.target.value as string;
                setSavedFilterAnchor(val);
                if (val) handleApplySavedFilter(val);
              }}
              renderValue={(val) => {
                const found = savedFilters.find((f) => f.id === val);
                return found ? found.name : "Saved Filters";
              }}
            >
              <MenuItem value="" disabled>
                Saved Filters
              </MenuItem>
              {savedFilters.length === 0 && (
                <MenuItem disabled value="__empty__">
                  No saved filters
                </MenuItem>
              )}
              {savedFilters.map((f) => (
                <MenuItem
                  key={f.id}
                  value={f.id}
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 1,
                  }}
                >
                  <span style={{ flexGrow: 1 }}>{f.name}</span>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSavedMutation.mutate(f.id);
                    }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      </Paper>

      {/* ── Filter Chips ───────────────────────────────────────────────────── */}
      {hasFilters && (
        <Stack
          direction="row"
          flexWrap="wrap"
          sx={{ mb: 2, gap: 1, alignItems: "center" }}
        >
          {/* Category chips */}
          {filters.categoryIds?.map((cid) => (
            <Chip
              key={cid}
              size="small"
              label={`Category: ${categories.find((c) => c.id === cid)?.name ?? cid}`}
              onDelete={() => {
                const remaining = filters.categoryIds!.filter((x) => x !== cid);
                applyCategoryFilter(
                  remaining.length > 0 ? remaining : undefined,
                  products,
                );
                setPage(0);
              }}
            />
          ))}

          {/* Product chips */}
          {(filters.productIds?.length ?? 0) > MAX_CHIPS ? (
            <Chip
              size="small"
              label={`Products: ${filters.productIds!.length} selected`}
              onDelete={() => applyProductFilter(undefined)}
            />
          ) : (
            filters.productIds?.map((id) => (
              <Chip
                key={id}
                size="small"
                label={`Product: ${productsMap[id] ?? id}`}
                onDelete={() => handleRemoveProduct(id)}
              />
            ))
          )}

          {/* Location chips */}
          {(filters.locationIds?.length ?? 0) > MAX_CHIPS ? (
            <Chip
              size="small"
              label={`Locations: ${filters.locationIds!.length} selected`}
              onDelete={() => applyLocationFilter(undefined)}
            />
          ) : (
            filters.locationIds?.map((id) => (
              <Chip
                key={id}
                size="small"
                label={`Location: ${locationsMap[id] ?? id}`}
                onDelete={() => handleRemoveLocation(id)}
              />
            ))
          )}

          {/* Status chip */}
          {statusFilter !== "ALL" && (
            <Chip
              size="small"
              label={`Status: ${statusFilter}`}
              onDelete={() => {
                setStatusFilter("ALL");
                setPage(0);
              }}
            />
          )}

          <Button size="small" onClick={handleClearAll}>
            Clear
          </Button>
        </Stack>
      )}

      {/* ── Bulk Action Toolbar ────────────────────────────────────────────── */}
      {selectedIds.length > 0 && (
        <Paper sx={{ mb: 2 }}>
          <Toolbar sx={{ gap: 2 }}>
            <Typography sx={{ flex: 1 }} variant="body2">
              {selectedIds.length} selected
            </Typography>
            <Button
              variant="contained"
              size="small"
              disabled={bulkToggleMutation.isPending}
              onClick={() => handleBulkAction(true)}
            >
              Activate Selected
            </Button>
            <Button
              variant="outlined"
              size="small"
              disabled={bulkToggleMutation.isPending}
              onClick={() => handleBulkAction(false)}
            >
              Deactivate Selected
            </Button>
          </Toolbar>
        </Paper>
      )}

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      {isLoading && <CircularProgress />}
      {error && (
        <Alert severity="error">Failed to load product registrations</Alert>
      )}
      {!isLoading && !error && (
        <Paper>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      indeterminate={somePageSelected}
                      checked={allPageSelected}
                      onChange={handleSelectAll}
                      disabled={registrations.length === 0}
                    />
                  </TableCell>
                  <TableCell>Product (SKU)</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Product Name</TableCell>
                  <TableCell>Location</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {registrations.map((item) => (
                  <TableRow
                    key={item.id}
                    selected={selectedIds.includes(item.id)}
                    hover
                  >
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={selectedIds.includes(item.id)}
                        onChange={() => handleSelectRow(item.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <strong>{item.product?.sku}</strong>
                    </TableCell>
                    <TableCell>{item.product?.category?.name}</TableCell>
                    <TableCell>{item.product?.name}</TableCell>
                    <TableCell>
                      {item.location?.code} — {item.location?.name}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={item.isActive ? "Active" : "Inactive"}
                        color={item.isActive ? "success" : "default"}
                        size="small"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        startIcon={<EditIcon />}
                        onClick={() => openEdit(item)}
                      >
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {registrations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
                      No product registrations found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={handlePageChange}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={handleRowsPerPageChange}
            rowsPerPageOptions={[10, 20, 50]}
          />
        </Paper>
      )}

      {/* ── Advanced Filter Modal ──────────────────────────────────────────── */}
      <AdvancedFilterModal
        open={filterModalOpen}
        onClose={() => setFilterModalOpen(false)}
        initialFilters={{
          categoryIds: filters.categoryIds,
          productIds: filters.productIds,
          locationIds: filters.locationIds,
        }}
        onApply={(data) => {
          applyAdvancedFilters(data);
          setPage(0);
        }}
      />

      {/* ── Save Filter Modal ──────────────────────────────────────────────── */}
      <SaveFilterModal
        open={openSave}
        onClose={() => setOpenSave(false)}
        onSave={(name) => saveMutation.mutate(name)}
      />

      {/* ── Create Modal ───────────────────────────────────────────────────── */}
      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Register Product at Location</DialogTitle>
        <form onSubmit={createForm.handleSubmit(onCreateSubmit)}>
          <DialogContent>
            {apiError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {apiError}
              </Alert>
            )}
            <Controller
              name="productId"
              control={createForm.control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  select
                  label="Product"
                  fullWidth
                  margin="normal"
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                >
                  {products
                    .filter((p) => p.isActive)
                    .map((p) => (
                      <MenuItem key={p.id} value={p.id}>
                        {p.sku} — {p.name}
                      </MenuItem>
                    ))}
                </TextField>
              )}
            />
            <Controller
              name="locationId"
              control={createForm.control}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  select
                  label="Location"
                  fullWidth
                  margin="normal"
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                >
                  {locations.map((l) => (
                    <MenuItem key={l.id} value={l.id}>
                      {l.code} — {l.name}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
            <Controller
              name="isActive"
              control={createForm.control}
              render={({ field }) => (
                <FormControlLabel
                  control={
                    <Switch checked={!!field.value} onChange={field.onChange} />
                  }
                  label="Active"
                  sx={{ mt: 1 }}
                />
              )}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              type="submit"
              variant="contained"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* ── Edit Modal ─────────────────────────────────────────────────────── */}
      <Dialog
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Edit Registration</DialogTitle>
        <form onSubmit={editForm.handleSubmit(onEditSubmit)}>
          <DialogContent>
            {apiError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {apiError}
              </Alert>
            )}
            {editTarget && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                <strong>{editTarget.product?.sku}</strong> —{" "}
                {editTarget.product?.name} at{" "}
                <strong>{editTarget.location?.code}</strong> —{" "}
                {editTarget.location?.name}
              </Typography>
            )}
            <Controller
              name="isActive"
              control={editForm.control}
              render={({ field }) => {
                const hasPending =
                  deactivationCheck && !deactivationCheck.canDeactivate;
                const switchDisabled = !!hasPending && field.value === true;
                const tooltipTitle = hasPending
                  ? `Cannot deactivate: ${deactivationCheck.pendingCount} pending request(s) exist ` +
                    `(${deactivationCheck.adjustments} adjustment(s), ${deactivationCheck.transfers} transfer(s)). Resolve them first.`
                  : "";
                return (
                  <Tooltip title={tooltipTitle} arrow>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={field.value}
                          onChange={field.onChange}
                          disabled={switchDisabled}
                        />
                      }
                      label="Active"
                      sx={{ mt: 1 }}
                    />
                  </Tooltip>
                );
              }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button
              type="submit"
              variant="contained"
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* ── Bulk Toggle Confirmation ───────────────────────────────────────── */}
      <Dialog
        open={!!bulkConfirm}
        onClose={() => setBulkConfirm(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Confirm Bulk Action</DialogTitle>
        <DialogContent>
          <Typography>
            {bulkConfirm?.isActive
              ? `Activate ${selectedIds.length} selected item${selectedIds.length !== 1 ? "s" : ""}?`
              : `Deactivate ${selectedIds.length} selected item${selectedIds.length !== 1 ? "s" : ""}?`}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setBulkConfirm(null)}
            disabled={bulkToggleMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={onBulkConfirm}
            disabled={bulkToggleMutation.isPending}
          >
            {bulkToggleMutation.isPending ? "Processing..." : "Confirm"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      <Snackbar
        open={!!snack}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity={snack?.severity ?? "info"}
          onClose={() => setSnack(null)}
        >
          {snack?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
