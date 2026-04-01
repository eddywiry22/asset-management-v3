import { useState, useMemo, useRef } from 'react';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, IconButton, InputLabel, MenuItem, Paper,
  Select, Snackbar, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TablePagination, TableRow, TextField,
  Typography, CircularProgress, Alert, Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import FilterListIcon from '@mui/icons-material/FilterList';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { productsService, Product } from '../../../services/products.service';
import { categoriesService } from '../../../services/categories.service';
import { vendorsService } from '../../../services/vendors.service';
import { uomsService } from '../../../services/uoms.service';
import { savedFiltersService } from '../../../services/savedFilters.service';
import SaveFilterModal from '../../../components/SaveFilterModal';
import ProductAdvancedFilterModal from '../components/ProductAdvancedFilterModal';
import apiClient from '../../../api/client';

// ---------------------------------------------------------------------------
// Form schemas
// ---------------------------------------------------------------------------
const createSchema = z.object({
  sku:        z.string().min(1, 'SKU is required'),
  name:       z.string().min(1, 'Name is required'),
  categoryId: z.string().min(1, 'Category is required'),
  vendorId:   z.string().min(1, 'Vendor is required'),
  uomId:      z.string().min(1, 'UOM is required'),
});

const editSchema = z.object({
  name:       z.string().min(1, 'Name is required'),
  categoryId: z.string().min(1, 'Category is required'),
  vendorId:   z.string().min(1, 'Vendor is required'),
  uomId:      z.string().min(1, 'UOM is required'),
});

type CreateForm = z.infer<typeof createSchema>;
type EditForm   = z.infer<typeof editSchema>;

// ---------------------------------------------------------------------------
// Multi-create types
// ---------------------------------------------------------------------------
type ProductRow = {
  id: string;
  sku: string;
  name: string;
  categoryId: string;
  vendorId: string;
  uomId: string;
  errors?: {
    sku?: string;
    name?: string;
    categoryId?: string;
    vendorId?: string;
    uomId?: string;
  };
  status?: 'idle' | 'success' | 'error';
  errorMessage?: string;
};

const createEmptyRow = (): ProductRow => ({
  id: crypto.randomUUID(),
  sku: '',
  name: '',
  categoryId: '',
  vendorId: '',
  uomId: '',
  status: 'idle',
});

// ---------------------------------------------------------------------------
// Applied filter shape
// ---------------------------------------------------------------------------
type AppliedFilters = {
  search?: string;
  categoryIds?: string[];
  vendorIds?: string[];
};

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function ProductsPage() {
  const queryClient = useQueryClient();

  // -- Pagination --
  const [page, setPage]     = useState(0);
  const [rowsPerPage]       = useState(20);

  // -- Staging filter state (UI inputs, not yet applied) --
  const [search, setSearch]         = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [vendorId, setVendorId]     = useState('');

  // -- Applied filters (used in query) --
  const [appliedFilters, setAppliedFilters] = useState<AppliedFilters>({});

  // -- Modal state --
  const [createOpen, setCreateOpen]               = useState(false);
  const [editTarget, setEditTarget]               = useState<Product | null>(null);
  const [filterModalOpen, setFilterModalOpen]     = useState(false);
  const [openSave, setOpenSave]                   = useState(false);
  const [savedFilterAnchor, setSavedFilterAnchor] = useState('');
  const [apiError, setApiError]                   = useState('');
  const [snackMsg, setSnackMsg]                   = useState('');
  const [templateLoading, setTemplateLoading]     = useState(false);
  const [uploadFile, setUploadFile]               = useState<File | null>(null);
  const [uploadLoading, setUploadLoading]         = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // -- Multi-create state --
  const [createMode, setCreateMode]   = useState<'single' | 'multi'>('single');
  const [rows, setRows]               = useState<ProductRow[]>([createEmptyRow()]);
  const [multiLoading, setMultiLoading] = useState(false);

  // ---------------------------------------------------------------------------
  // Reference data
  // ---------------------------------------------------------------------------
  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn:  categoriesService.getAll,
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn:  vendorsService.getAll,
  });

  const { data: uoms = [] } = useQuery({
    queryKey: ['uoms'],
    queryFn:  uomsService.getAll,
  });

  const { data: savedFilters = [] } = useQuery({
    queryKey: ['saved-filters', 'PRODUCTS'],
    queryFn:  () => savedFiltersService.getAll('PRODUCTS'),
  });

  // ---------------------------------------------------------------------------
  // Products query (paginated + filtered)
  // ---------------------------------------------------------------------------
  const { data, isLoading, error } = useQuery({
    queryKey: ['products', page, rowsPerPage, appliedFilters],
    queryFn: () => productsService.getAll({
      page:        page + 1,
      limit:       rowsPerPage,
      search:      appliedFilters.search     || undefined,
      categoryIds: appliedFilters.categoryIds,
      vendorIds:   appliedFilters.vendorIds,
    }),
  });

  const products = data?.data ?? [];
  const total    = data?.meta?.total ?? 0;

  // ---------------------------------------------------------------------------
  // Lookup maps for chips
  // ---------------------------------------------------------------------------
  const categoriesMap = useMemo(() => {
    const map: Record<string, string> = {};
    categories.forEach(c => { map[c.id] = c.name; });
    return map;
  }, [categories]);

  const vendorsMap = useMemo(() => {
    const map: Record<string, string> = {};
    vendors.forEach(v => { map[v.id] = v.name; });
    return map;
  }, [vendors]);

  // ---------------------------------------------------------------------------
  // Active filter count (for Advanced Filter button badge)
  // ---------------------------------------------------------------------------
  const activeCount =
    (appliedFilters.search ? 1 : 0) +
    (appliedFilters.categoryIds?.length ?? 0) +
    (appliedFilters.vendorIds?.length ?? 0);

  // ---------------------------------------------------------------------------
  // Filter handlers
  // ---------------------------------------------------------------------------
  const handleApply = () => {
    setAppliedFilters({
      search:      search || undefined,
      categoryIds: categoryId ? [categoryId] : undefined,
      vendorIds:   vendorId   ? [vendorId]   : undefined,
    });
    setPage(0);
  };

  const handleClear = () => {
    setSearch('');
    setCategoryId('');
    setVendorId('');
    setAppliedFilters({});
    setPage(0);
    setSavedFilterAnchor('');
  };

  const handleRemoveSearch = () => {
    setAppliedFilters(prev => ({ ...prev, search: undefined }));
    setSearch('');
    setPage(0);
  };

  const handleRemoveCategory = (id: string) => {
    const remaining = (appliedFilters.categoryIds ?? []).filter(c => c !== id);
    setAppliedFilters(prev => ({ ...prev, categoryIds: remaining.length ? remaining : undefined }));
    if (categoryId === id) setCategoryId('');
    setPage(0);
  };

  const handleRemoveVendor = (id: string) => {
    const remaining = (appliedFilters.vendorIds ?? []).filter(v => v !== id);
    setAppliedFilters(prev => ({ ...prev, vendorIds: remaining.length ? remaining : undefined }));
    if (vendorId === id) setVendorId('');
    setPage(0);
  };

  // ---------------------------------------------------------------------------
  // Saved filters
  // ---------------------------------------------------------------------------
  const saveMutation = useMutation({
    mutationFn: (name: string) =>
      savedFiltersService.create({
        name,
        module: 'PRODUCTS',
        filterJson: {
          search:      appliedFilters.search,
          categoryIds: appliedFilters.categoryIds,
          vendorIds:   appliedFilters.vendorIds,
        } as Record<string, unknown>,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-filters', 'PRODUCTS'] });
      setOpenSave(false);
      setSnackMsg('Filter saved');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => savedFiltersService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-filters', 'PRODUCTS'] });
      setSnackMsg('Filter deleted');
    },
  });

  function handleApplySavedFilter(id: string) {
    const saved = savedFilters.find(f => f.id === id);
    if (!saved) return;
    const fj = saved.filterJson as AppliedFilters;
    setAppliedFilters({
      search:      fj.search      || undefined,
      categoryIds: fj.categoryIds || undefined,
      vendorIds:   fj.vendorIds   || undefined,
    });
    setSearch(fj.search ?? '');
    setCategoryId(fj.categoryIds?.[0] ?? '');
    setVendorId(fj.vendorIds?.[0]     ?? '');
    setPage(0);
    setSavedFilterAnchor('');
  }

  // ---------------------------------------------------------------------------
  // Create / Edit forms
  // ---------------------------------------------------------------------------
  const createForm = useForm<CreateForm>({ resolver: zodResolver(createSchema) });
  const editForm   = useForm<EditForm>({ resolver: zodResolver(editSchema) });

  const createMutation = useMutation({
    mutationFn: productsService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setCreateOpen(false);
      createForm.reset();
      setApiError('');
    },
    onError: (err: any) => {
      setApiError(err?.response?.data?.error?.message ?? 'Failed to create product');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data: formData }: { id: string; data: EditForm }) =>
      productsService.update(id, formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setEditTarget(null);
      setApiError('');
    },
    onError: (err: any) => {
      setApiError(err?.response?.data?.error?.message ?? 'Failed to update product');
    },
  });

  const openEdit = (item: Product) => {
    setEditTarget(item);
    editForm.reset({
      name:       item.name,
      categoryId: item.categoryId,
      vendorId:   item.vendorId,
      uomId:      item.uomId,
    });
    setApiError('');
  };

  const onCreateSubmit = (formData: CreateForm) => {
    setApiError('');
    createMutation.mutate(formData);
  };

  const onEditSubmit = (formData: EditForm) => {
    if (!editTarget) return;
    setApiError('');
    updateMutation.mutate({ id: editTarget.id, data: formData });
  };

  // ---------------------------------------------------------------------------
  // Create modal close (resets mode + rows)
  // ---------------------------------------------------------------------------
  const handleCreateClose = () => {
    if (multiLoading) return;
    setCreateOpen(false);
    setCreateMode('single');
    setRows([createEmptyRow()]);
    setApiError('');
    createForm.reset();
  };

  // ---------------------------------------------------------------------------
  // Multi-create handlers
  // ---------------------------------------------------------------------------
  const handleAddRow = () => {
    if (rows.length >= 20) return;
    setRows(prev => [...prev, createEmptyRow()]);
  };

  const handleRemoveRow = (id: string) => {
    setRows(prev => {
      if (prev.length === 1) return [createEmptyRow()];
      return prev.filter(r => r.id !== id);
    });
  };

  const handleRowChange = (
    id: string,
    field: keyof Pick<ProductRow, 'sku' | 'name' | 'categoryId' | 'vendorId' | 'uomId'>,
    value: string,
  ) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const validateRows = (rowsToValidate: ProductRow[]): ProductRow[] => {
    const skuCount: Record<string, number> = {};
    rowsToValidate.forEach(r => {
      if (r.sku.trim()) {
        const key = r.sku.trim().toLowerCase();
        skuCount[key] = (skuCount[key] || 0) + 1;
      }
    });

    return rowsToValidate.map(r => {
      const errors: ProductRow['errors'] = {};
      if (!r.sku.trim()) {
        errors.sku = 'Required';
      } else if (skuCount[r.sku.trim().toLowerCase()] > 1) {
        errors.sku = 'Duplicate in list';
      }
      if (!r.name.trim())    errors.name       = 'Required';
      if (!r.categoryId)     errors.categoryId = 'Required';
      if (!r.vendorId)       errors.vendorId   = 'Required';
      if (!r.uomId)          errors.uomId      = 'Required';
      return { ...r, errors };
    });
  };

  const handleMultiSubmit = async () => {
    const validated = validateRows(rows);
    setRows(validated);
    const hasError = validated.some(r => Object.keys(r.errors || {}).length > 0);
    if (hasError) return;

    setMultiLoading(true);
    const updatedRows = [...validated];

    for (let i = 0; i < updatedRows.length; i++) {
      const row = updatedRows[i];
      try {
        await apiClient.post('/products', {
          sku:        row.sku,
          name:       row.name,
          categoryId: row.categoryId,
          vendorId:   row.vendorId,
          uomId:      row.uomId,
        });
        updatedRows[i] = { ...row, status: 'success', errors: {} };
      } catch (err: any) {
        updatedRows[i] = {
          ...row,
          status: 'error',
          errorMessage:
            err?.response?.data?.error?.message ||
            err?.response?.data?.message ||
            'Failed',
        };
      }
      setRows([...updatedRows]);
    }

    setMultiLoading(false);
    queryClient.invalidateQueries({ queryKey: ['products'] });

    const successCount = updatedRows.filter(r => r.status === 'success').length;
    const failCount    = updatedRows.filter(r => r.status === 'error').length;
    if (failCount === 0) {
      setSnackMsg(`${successCount} product${successCount !== 1 ? 's' : ''} created successfully`);
    } else {
      setSnackMsg(`${successCount} succeeded, ${failCount} failed — fix errors and retry`);
    }
  };

  // ---------------------------------------------------------------------------
  // Bulk upload
  // ---------------------------------------------------------------------------
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) setUploadFile(selected);
    // Reset input so the same file can be re-selected after a run
    e.target.value = '';
  };

  const handleUpload = async () => {
    if (!uploadFile) return;
    setUploadLoading(true);
    try {
      await productsService.uploadBulkProducts(uploadFile);
      setUploadFile(null);
      setSnackMsg('Upload complete. Check downloaded file for results.');
      queryClient.invalidateQueries({ queryKey: ['products'] });
    } catch (err) {
      console.error(err);
      setSnackMsg('Bulk upload failed. Please try again.');
    } finally {
      setUploadLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Bulk template download
  // ---------------------------------------------------------------------------
  const handleDownloadTemplate = async () => {
    setTemplateLoading(true);
    try {
      await productsService.downloadBulkTemplate();
    } catch (err) {
      console.error(err);
      setSnackMsg('Failed to download template');
    } finally {
      setTemplateLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Derived helpers for multi-create
  // ---------------------------------------------------------------------------
  const allRowsEmpty = rows.every(
    r => !r.sku.trim() && !r.name.trim() && !r.categoryId && !r.vendorId && !r.uomId,
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">Products</Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <Tooltip title="Download Excel template for bulk product upload">
            <span>
              <Button
                variant="outlined"
                startIcon={templateLoading ? <CircularProgress size={16} /> : <DownloadIcon />}
                onClick={handleDownloadTemplate}
                disabled={templateLoading}
              >
                {templateLoading ? 'Downloading…' : 'Download Template'}
              </Button>
            </span>
          </Tooltip>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />

          <Tooltip title="Select an .xlsx file to bulk upload products">
            <span>
              <Button
                variant="outlined"
                startIcon={<UploadFileIcon />}
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadLoading}
              >
                {uploadFile ? uploadFile.name : 'Choose File'}
              </Button>
            </span>
          </Tooltip>

          {uploadFile && (
            <Tooltip title="Upload selected file and download annotated result">
              <span>
                <Button
                  variant="contained"
                  startIcon={uploadLoading ? <CircularProgress size={16} /> : <UploadFileIcon />}
                  onClick={handleUpload}
                  disabled={uploadLoading}
                >
                  {uploadLoading ? 'Uploading…' : 'Upload'}
                </Button>
              </span>
            </Tooltip>
          )}

          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => { setCreateOpen(true); setApiError(''); }}
          >
            Add Product
          </Button>
        </Stack>
      </Box>

      {/* Filter Bar */}
      <Paper sx={{ p: 2, mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          label="Search"
          size="small"
          placeholder="Name or SKU…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleApply(); }}
          sx={{ minWidth: 200 }}
        />

        <FormControl sx={{ minWidth: 180 }} size="small">
          <InputLabel>Category</InputLabel>
          <Select
            value={categoryId}
            label="Category"
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <MenuItem value="">All</MenuItem>
            {categories.map(c => (
              <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl sx={{ minWidth: 180 }} size="small">
          <InputLabel>Vendor</InputLabel>
          <Select
            value={vendorId}
            label="Vendor"
            onChange={(e) => setVendorId(e.target.value)}
          >
            <MenuItem value="">All</MenuItem>
            {vendors.map(v => (
              <MenuItem key={v.id} value={v.id}>{v.name}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <Button variant="outlined" onClick={handleApply}>
          Apply
        </Button>

        <Button variant="text" onClick={handleClear}>
          Clear
        </Button>

        <Button
          variant="contained"
          startIcon={<FilterListIcon />}
          onClick={() => setFilterModalOpen(true)}
        >
          Advanced Filter{activeCount > 0 ? ` (${activeCount})` : ''}
        </Button>

        <Button
          variant="outlined"
          startIcon={<BookmarkBorderIcon />}
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
              const found = savedFilters.find(f => f.id === val);
              return found ? found.name : 'Saved Filters';
            }}
          >
            <MenuItem value="" disabled>Saved Filters</MenuItem>
            {savedFilters.length === 0 && (
              <MenuItem disabled value="">No saved filters</MenuItem>
            )}
            {savedFilters.map(f => (
              <MenuItem
                key={f.id}
                value={f.id}
                sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}
              >
                <span style={{ flexGrow: 1 }}>{f.name}</span>
                <IconButton
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteMutation.mutate(f.id);
                  }}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Paper>

      {/* Filter Chips */}
      {activeCount > 0 && (
        <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 2, alignItems: 'center', gap: 1 }}>
          {appliedFilters.search && (
            <Chip
              size="small"
              label={`Search: ${appliedFilters.search}`}
              onDelete={handleRemoveSearch}
            />
          )}
          {(appliedFilters.categoryIds ?? []).map(id => (
            <Chip
              key={id}
              size="small"
              label={`Category: ${categoriesMap[id] ?? id}`}
              onDelete={() => handleRemoveCategory(id)}
            />
          ))}
          {(appliedFilters.vendorIds ?? []).map(id => (
            <Chip
              key={id}
              size="small"
              label={`Vendor: ${vendorsMap[id] ?? id}`}
              onDelete={() => handleRemoveVendor(id)}
            />
          ))}
          <Button size="small" onClick={handleClear}>
            Clear All
          </Button>
        </Stack>
      )}

      {/* Table */}
      {isLoading && <CircularProgress />}
      {error     && <Alert severity="error">Failed to load products</Alert>}

      {!isLoading && !error && (
        <>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>SKU</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Vendor</TableCell>
                  <TableCell>UOM</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {products.map((item) => (
                  <TableRow key={item.id} hover>
                    <TableCell><strong>{item.sku}</strong></TableCell>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.category?.name}</TableCell>
                    <TableCell>{item.vendor?.name}</TableCell>
                    <TableCell>{item.uom?.code}</TableCell>
                    <TableCell align="right">
                      <Button size="small" startIcon={<EditIcon />} onClick={() => openEdit(item)}>
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {products.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center">No products found</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <TablePagination
            component="div"
            count={total}
            page={page}
            rowsPerPage={rowsPerPage}
            rowsPerPageOptions={[20]}
            onPageChange={(_, p) => setPage(p)}
          />
        </>
      )}

      {/* Advanced Filter Modal */}
      <ProductAdvancedFilterModal
        open={filterModalOpen}
        onClose={() => setFilterModalOpen(false)}
        initialFilters={{
          categoryIds: appliedFilters.categoryIds,
          vendorIds:   appliedFilters.vendorIds,
        }}
        onApply={({ categoryIds, vendorIds }) => {
          setAppliedFilters(prev => ({
            ...prev,
            categoryIds: categoryIds.length ? categoryIds : undefined,
            vendorIds:   vendorIds.length   ? vendorIds   : undefined,
          }));
          setCategoryId(categoryIds[0] ?? '');
          setVendorId(vendorIds[0]     ?? '');
          setPage(0);
        }}
      />

      {/* Save Filter Modal */}
      <SaveFilterModal
        open={openSave}
        onClose={() => setOpenSave(false)}
        onSave={(name) => saveMutation.mutate(name)}
      />

      {/* Create Modal */}
      <Dialog
        open={createOpen}
        onClose={handleCreateClose}
        maxWidth={createMode === 'multi' ? 'xl' : 'sm'}
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <span>Add Product</span>
            <TextField
              select
              size="small"
              value={createMode}
              onChange={(e) => setCreateMode(e.target.value as 'single' | 'multi')}
              sx={{ minWidth: 160 }}
              disabled={multiLoading || createMutation.isPending}
            >
              <MenuItem value="single">Single Create</MenuItem>
              <MenuItem value="multi">Multi Create</MenuItem>
            </TextField>
          </Box>
        </DialogTitle>

        {/* ── Single Create ── */}
        {createMode === 'single' && (
          <form onSubmit={createForm.handleSubmit(onCreateSubmit)}>
            <DialogContent>
              {apiError && <Alert severity="error" sx={{ mb: 2 }}>{apiError}</Alert>}
              <Controller
                name="sku"
                control={createForm.control}
                render={({ field, fieldState }) => (
                  <TextField {...field} label="SKU" fullWidth margin="normal"
                    error={!!fieldState.error} helperText={fieldState.error?.message} />
                )}
              />
              <Controller
                name="name"
                control={createForm.control}
                render={({ field, fieldState }) => (
                  <TextField {...field} label="Name" fullWidth margin="normal"
                    error={!!fieldState.error} helperText={fieldState.error?.message} />
                )}
              />
              <Controller
                name="categoryId"
                control={createForm.control}
                render={({ field, fieldState }) => (
                  <TextField {...field} select label="Category" fullWidth margin="normal"
                    error={!!fieldState.error} helperText={fieldState.error?.message}>
                    {categories.filter(c => c.isActive).map((c) => (
                      <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                    ))}
                  </TextField>
                )}
              />
              <Controller
                name="vendorId"
                control={createForm.control}
                render={({ field, fieldState }) => (
                  <TextField {...field} select label="Vendor" fullWidth margin="normal"
                    error={!!fieldState.error} helperText={fieldState.error?.message}>
                    {vendors.filter(v => v.isActive).map((v) => (
                      <MenuItem key={v.id} value={v.id}>{v.name}</MenuItem>
                    ))}
                  </TextField>
                )}
              />
              <Controller
                name="uomId"
                control={createForm.control}
                render={({ field, fieldState }) => (
                  <TextField {...field} select label="Unit of Measurement" fullWidth margin="normal"
                    error={!!fieldState.error} helperText={fieldState.error?.message}>
                    {uoms.map((u) => (
                      <MenuItem key={u.id} value={u.id}>{u.code} — {u.name}</MenuItem>
                    ))}
                  </TextField>
                )}
              />
            </DialogContent>
            <DialogActions>
              <Button onClick={handleCreateClose}>Cancel</Button>
              <Button type="submit" variant="contained" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Saving…' : 'Save'}
              </Button>
            </DialogActions>
          </form>
        )}

        {/* ── Multi Create ── */}
        {createMode === 'multi' && (
          <>
            <DialogContent sx={{ pb: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="subtitle1" fontWeight={600}>
                  Multi Create Products
                </Typography>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={handleAddRow}
                  disabled={multiLoading || rows.length >= 20}
                >
                  Add Row {rows.length >= 20 ? '(max 20)' : `(${rows.length}/20)`}
                </Button>
              </Box>

              <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
                <Table size="small" sx={{ minWidth: 900 }}>
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'grey.50' }}>
                      <TableCell sx={{ width: 40, p: 1 }}>#</TableCell>
                      <TableCell sx={{ minWidth: 130 }}>SKU *</TableCell>
                      <TableCell sx={{ minWidth: 160 }}>Name *</TableCell>
                      <TableCell sx={{ minWidth: 150 }}>Category *</TableCell>
                      <TableCell sx={{ minWidth: 150 }}>Vendor *</TableCell>
                      <TableCell sx={{ minWidth: 140 }}>UOM *</TableCell>
                      <TableCell sx={{ width: 60, textAlign: 'center' }}>Status</TableCell>
                      <TableCell sx={{ width: 48 }} />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((row, idx) => (
                      <TableRow
                        key={row.id}
                        sx={{
                          bgcolor:
                            row.status === 'success' ? 'success.50' :
                            row.status === 'error'   ? 'error.50'   :
                            'inherit',
                          '&:hover': { bgcolor: row.status === 'success' ? 'success.100' : row.status === 'error' ? 'error.100' : 'action.hover' },
                          verticalAlign: 'top',
                        }}
                      >
                        {/* Row number */}
                        <TableCell sx={{ p: 1, pt: 1.5, color: 'text.secondary', fontSize: 12 }}>
                          {idx + 1}
                        </TableCell>

                        {/* SKU */}
                        <TableCell sx={{ p: 0.5 }}>
                          <TextField
                            size="small"
                            fullWidth
                            value={row.sku}
                            onChange={(e) => handleRowChange(row.id, 'sku', e.target.value)}
                            error={!!row.errors?.sku}
                            helperText={row.errors?.sku}
                            disabled={multiLoading || row.status === 'success'}
                            inputProps={{ style: { fontSize: 13 } }}
                          />
                        </TableCell>

                        {/* Name */}
                        <TableCell sx={{ p: 0.5 }}>
                          <TextField
                            size="small"
                            fullWidth
                            value={row.name}
                            onChange={(e) => handleRowChange(row.id, 'name', e.target.value)}
                            error={!!row.errors?.name}
                            helperText={row.errors?.name}
                            disabled={multiLoading || row.status === 'success'}
                            inputProps={{ style: { fontSize: 13 } }}
                          />
                        </TableCell>

                        {/* Category */}
                        <TableCell sx={{ p: 0.5 }}>
                          <TextField
                            select
                            size="small"
                            fullWidth
                            value={row.categoryId}
                            onChange={(e) => handleRowChange(row.id, 'categoryId', e.target.value)}
                            error={!!row.errors?.categoryId}
                            helperText={row.errors?.categoryId}
                            disabled={multiLoading || row.status === 'success'}
                            inputProps={{ style: { fontSize: 13 } }}
                          >
                            <MenuItem value=""><em>Select…</em></MenuItem>
                            {categories.filter(c => c.isActive).map((c) => (
                              <MenuItem key={c.id} value={c.id} sx={{ fontSize: 13 }}>{c.name}</MenuItem>
                            ))}
                          </TextField>
                        </TableCell>

                        {/* Vendor */}
                        <TableCell sx={{ p: 0.5 }}>
                          <TextField
                            select
                            size="small"
                            fullWidth
                            value={row.vendorId}
                            onChange={(e) => handleRowChange(row.id, 'vendorId', e.target.value)}
                            error={!!row.errors?.vendorId}
                            helperText={row.errors?.vendorId}
                            disabled={multiLoading || row.status === 'success'}
                            inputProps={{ style: { fontSize: 13 } }}
                          >
                            <MenuItem value=""><em>Select…</em></MenuItem>
                            {vendors.filter(v => v.isActive).map((v) => (
                              <MenuItem key={v.id} value={v.id} sx={{ fontSize: 13 }}>{v.name}</MenuItem>
                            ))}
                          </TextField>
                        </TableCell>

                        {/* UOM */}
                        <TableCell sx={{ p: 0.5 }}>
                          <TextField
                            select
                            size="small"
                            fullWidth
                            value={row.uomId}
                            onChange={(e) => handleRowChange(row.id, 'uomId', e.target.value)}
                            error={!!row.errors?.uomId}
                            helperText={row.errors?.uomId}
                            disabled={multiLoading || row.status === 'success'}
                            inputProps={{ style: { fontSize: 13 } }}
                          >
                            <MenuItem value=""><em>Select…</em></MenuItem>
                            {uoms.map((u) => (
                              <MenuItem key={u.id} value={u.id} sx={{ fontSize: 13 }}>
                                {u.code} — {u.name}
                              </MenuItem>
                            ))}
                          </TextField>
                        </TableCell>

                        {/* Status */}
                        <TableCell sx={{ textAlign: 'center', p: 0.5, pt: 1.5 }}>
                          {row.status === 'success' && (
                            <Tooltip title="Created successfully">
                              <span style={{ fontSize: 18 }}>✅</span>
                            </Tooltip>
                          )}
                          {row.status === 'error' && (
                            <Tooltip title={row.errorMessage ?? 'Failed'}>
                              <span style={{ fontSize: 18 }}>❌</span>
                            </Tooltip>
                          )}
                          {row.errorMessage && row.status === 'error' && (
                            <Typography variant="caption" color="error" display="block" sx={{ mt: 0.5, lineHeight: 1.2 }}>
                              {row.errorMessage}
                            </Typography>
                          )}
                        </TableCell>

                        {/* Remove */}
                        <TableCell sx={{ p: 0.5, pt: 1 }}>
                          <IconButton
                            size="small"
                            onClick={() => handleRemoveRow(row.id)}
                            disabled={multiLoading || row.status === 'success'}
                            color="error"
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                {rows.length} row{rows.length !== 1 ? 's' : ''} · Rows persist after submit so you can fix errors and retry
              </Typography>
            </DialogContent>

            <DialogActions>
              <Button onClick={handleCreateClose} disabled={multiLoading}>
                Close
              </Button>
              <Button
                variant="contained"
                onClick={handleMultiSubmit}
                disabled={multiLoading || allRowsEmpty}
                startIcon={multiLoading ? <CircularProgress size={16} /> : undefined}
              >
                {multiLoading ? 'Creating…' : `Create All (${rows.filter(r => r.status !== 'success').length})`}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={!!editTarget} onClose={() => setEditTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Product</DialogTitle>
        <form onSubmit={editForm.handleSubmit(onEditSubmit)}>
          <DialogContent>
            {apiError && <Alert severity="error" sx={{ mb: 2 }}>{apiError}</Alert>}
            <Controller
              name="name"
              control={editForm.control}
              render={({ field, fieldState }) => (
                <TextField {...field} label="Name" fullWidth margin="normal"
                  error={!!fieldState.error} helperText={fieldState.error?.message} />
              )}
            />
            <Controller
              name="categoryId"
              control={editForm.control}
              render={({ field, fieldState }) => (
                <TextField {...field} select label="Category" fullWidth margin="normal"
                  error={!!fieldState.error} helperText={fieldState.error?.message}>
                  {categories.filter(c => c.isActive).map((c) => (
                    <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                  ))}
                </TextField>
              )}
            />
            <Controller
              name="vendorId"
              control={editForm.control}
              render={({ field, fieldState }) => (
                <TextField {...field} select label="Vendor" fullWidth margin="normal"
                  error={!!fieldState.error} helperText={fieldState.error?.message}>
                  {vendors.filter(v => v.isActive).map((v) => (
                    <MenuItem key={v.id} value={v.id}>{v.name}</MenuItem>
                  ))}
                </TextField>
              )}
            />
            <Controller
              name="uomId"
              control={editForm.control}
              render={({ field, fieldState }) => (
                <TextField {...field} select label="Unit of Measurement" fullWidth margin="normal"
                  error={!!fieldState.error} helperText={fieldState.error?.message}>
                  {uoms.map((u) => (
                    <MenuItem key={u.id} value={u.id}>{u.code} — {u.name}</MenuItem>
                  ))}
                </TextField>
              )}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={!!snackMsg}
        autoHideDuration={3000}
        onClose={() => setSnackMsg('')}
        message={snackMsg}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      />
    </Box>
  );
}
