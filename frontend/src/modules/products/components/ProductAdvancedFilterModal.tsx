import { useState, useEffect } from 'react';
import {
  Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, List, ListItem, ListItemButton, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { categoriesService } from '../../../services/categories.service';
import { vendorsService } from '../../../services/vendors.service';

type ProductAdvancedFilterModalProps = {
  open: boolean;
  onClose: () => void;
  onApply: (filters: { categoryIds: string[]; vendorIds: string[] }) => void;
  initialFilters?: { categoryIds?: string[]; vendorIds?: string[] };
};

export default function ProductAdvancedFilterModal({
  open, onClose, onApply, initialFilters,
}: ProductAdvancedFilterModalProps) {
  const [tab, setTab] = useState<'categories' | 'vendors'>('categories');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [selectedVendorIds, setSelectedVendorIds] = useState<string[]>([]);
  const [searchCategory, setSearchCategory] = useState('');
  const [searchVendor, setSearchVendor] = useState('');

  useEffect(() => {
    if (open) {
      setSelectedCategoryIds(initialFilters?.categoryIds ?? []);
      setSelectedVendorIds(initialFilters?.vendorIds ?? []);
      setSearchCategory('');
      setSearchVendor('');
      setTab('categories');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn:  categoriesService.getAll,
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors'],
    queryFn:  vendorsService.getAll,
  });

  const visibleCategories = categories.filter(c =>
    c.name.toLowerCase().includes(searchCategory.toLowerCase())
  );
  const visibleVendors = vendors.filter(v =>
    v.name.toLowerCase().includes(searchVendor.toLowerCase())
  );

  const toggleCategory = (id: string) => {
    setSelectedCategoryIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleVendor = (id: string) => {
    setSelectedVendorIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const categoryTabLabel = selectedCategoryIds.length > 0
    ? `Categories (${selectedCategoryIds.length})`
    : 'Categories';
  const vendorTabLabel = selectedVendorIds.length > 0
    ? `Vendors (${selectedVendorIds.length})`
    : 'Vendors';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Advanced Filter</DialogTitle>

      <DialogContent sx={{ p: 0, minHeight: 440 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab label={categoryTabLabel} value="categories" />
          <Tab label={vendorTabLabel}   value="vendors" />
        </Tabs>

        {/* ── Categories tab ─────────────────────────────────────────── */}
        {tab === 'categories' && (
          <Box sx={{ px: 2, pt: 2 }}>
            <TextField
              fullWidth size="small" placeholder="Search categories..."
              value={searchCategory}
              onChange={(e) => setSearchCategory(e.target.value)}
              sx={{ mb: 1 }}
            />
            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
              <Button size="small" onClick={() => setSelectedCategoryIds(visibleCategories.map(c => c.id))}>
                Select All ({visibleCategories.length})
              </Button>
              <Button size="small" onClick={() => setSelectedCategoryIds([])}>
                Clear Selection
              </Button>
            </Box>
            <List dense sx={{ maxHeight: 300, overflowY: 'auto' }}>
              {visibleCategories.map(c => (
                <ListItem key={c.id} disablePadding>
                  <ListItemButton onClick={() => toggleCategory(c.id)}>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={selectedCategoryIds.includes(c.id)}
                          size="small"
                        />
                      }
                      label={c.name}
                      onClick={(e) => e.preventDefault()}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
              {visibleCategories.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                  No categories found
                </Typography>
              )}
            </List>
          </Box>
        )}

        {/* ── Vendors tab ────────────────────────────────────────────── */}
        {tab === 'vendors' && (
          <Box sx={{ px: 2, pt: 2 }}>
            <TextField
              fullWidth size="small" placeholder="Search vendors..."
              value={searchVendor}
              onChange={(e) => setSearchVendor(e.target.value)}
              sx={{ mb: 1 }}
            />
            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
              <Button size="small" onClick={() => setSelectedVendorIds(visibleVendors.map(v => v.id))}>
                Select All ({visibleVendors.length})
              </Button>
              <Button size="small" onClick={() => setSelectedVendorIds([])}>
                Clear Selection
              </Button>
            </Box>
            <List dense sx={{ maxHeight: 300, overflowY: 'auto' }}>
              {visibleVendors.map(v => (
                <ListItem key={v.id} disablePadding>
                  <ListItemButton onClick={() => toggleVendor(v.id)}>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={selectedVendorIds.includes(v.id)}
                          size="small"
                        />
                      }
                      label={v.name}
                      onClick={(e) => e.preventDefault()}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
              {visibleVendors.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                  No vendors found
                </Typography>
              )}
            </List>
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={() => {
            onApply({ categoryIds: selectedCategoryIds, vendorIds: selectedVendorIds });
            onClose();
          }}
        >
          Apply
        </Button>
      </DialogActions>
    </Dialog>
  );
}
