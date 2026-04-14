import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useQuery } from '@tanstack/react-query';
import stockService from '../../../services/stock.service';
import { categoriesService } from '../../../services/categories.service';
import useStockOpnameReport from '../hooks/useStockOpnameReport';
import StockOpnameFilters, {
  StockOpnameFilterState,
  FilterOption,
} from './StockOpnameFilters';
import StockOpnamePreview from './StockOpnamePreview';

interface Props {
  open: boolean;
  onClose: () => void;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultFilterState(): StockOpnameFilterState {
  return {
    startDate: todayIso(),
    endDate: todayIso(),
    locationIds: [],
    categoryIds: [],
  };
}

export default function StockOpnameReportModal({ open, onClose }: Props) {
  const [filters, setFilters] = useState<StockOpnameFilterState>(defaultFilterState);
  const { data, loading, error, fetchReport, reset } = useStockOpnameReport();

  // Reset state whenever the modal closes, so next open starts fresh.
  useEffect(() => {
    if (!open) {
      setFilters(defaultFilterState());
      reset();
    }
  }, [open, reset]);

  // Load filter option sources (locations visible to user, all categories)
  const { data: visibleLocations = [] } = useQuery({
    queryKey: ['stock-visible-locations'],
    queryFn: stockService.getVisibleLocations,
    enabled: open,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: categoriesService.getAll,
    enabled: open,
  });

  const locationOptions = useMemo<FilterOption[]>(
    () =>
      visibleLocations
        .map((l) => ({ id: l.id, label: `${l.name} (${l.code})` }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [visibleLocations],
  );

  const categoryOptions = useMemo<FilterOption[]>(
    () =>
      categories
        .map((c) => ({ id: c.id, label: c.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [categories],
  );

  const handlePreview = () => {
    fetchReport({
      startDate: filters.startDate,
      endDate: filters.endDate,
      locationIds: filters.locationIds.length ? filters.locationIds : undefined,
      categoryIds: filters.categoryIds.length ? filters.categoryIds : undefined,
    });
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      fullWidth
      PaperProps={{
        sx: {
          width: { xs: '95vw', md: 1100 },
          maxWidth: '95vw',
          height: '90vh',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pr: 1.5,
        }}
      >
        Stock Opname Report
        <IconButton onClick={onClose} size="small" aria-label="Close">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent
        dividers
        sx={{
          p: 0,
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* Filters section */}
        <Box sx={{ p: 2 }}>
          <StockOpnameFilters
            value={filters}
            onChange={setFilters}
            locationOptions={locationOptions}
            categoryOptions={categoryOptions}
            onPreview={handlePreview}
            onPrint={handlePrint}
            previewDisabled={loading}
            printDisabled={!data || loading}
          />
        </Box>

        <Divider />

        {/* Scrollable preview area */}
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            backgroundColor: '#eeeeee',
            p: 3,
          }}
        >
          {loading && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1.5,
                py: 6,
                color: 'text.secondary',
              }}
            >
              <CircularProgress size={22} />
              <span>Loading report...</span>
            </Box>
          )}

          {!loading && error && (
            <Alert severity="error" sx={{ maxWidth: 900, mx: 'auto' }}>
              {error}
            </Alert>
          )}

          {!loading && !error && !data && (
            <Box
              sx={{
                textAlign: 'center',
                color: 'text.secondary',
                py: 6,
                fontSize: 14,
              }}
            >
              Select a date range and click Preview to generate the report.
            </Box>
          )}

          {!loading && !error && data && (
            <Box
              sx={{
                maxWidth: 1000,
                mx: 'auto',
                backgroundColor: '#fff',
                boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
              }}
            >
              <div id="print-area">
                <StockOpnamePreview report={data} />
              </div>
            </Box>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  );
}
