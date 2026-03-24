import { useState, useEffect, useMemo } from 'react';
import {
  Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, List, ListItem, ListItemButton, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { goodsService } from '../services/goods.service';
import stockService from '../services/stock.service';
import { categoriesService } from '../services/categories.service';

type AdvancedFilterModalProps = {
  open: boolean;
  onClose: () => void;
  onApply: (filters: {
    categoryIds: string[];
    productIds: string[];
    locationIds: string[];
  }) => void;
  initialFilters?: {
    categoryIds?: string[];
    productIds?: string[];
    locationIds?: string[];
  };
};

export default function AdvancedFilterModal({
  open, onClose, onApply, initialFilters,
}: AdvancedFilterModalProps) {
  const [tab, setTab] = useState<'categories' | 'products' | 'locations'>('categories');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
  const [searchCategory, setSearchCategory] = useState('');
  const [searchProduct, setSearchProduct] = useState('');
  const [searchLocation, setSearchLocation] = useState('');

  // Seed from initialFilters each time the modal opens
  useEffect(() => {
    if (open) {
      setSelectedCategoryIds(initialFilters?.categoryIds ?? []);
      setSelectedProductIds(initialFilters?.productIds ?? []);
      setSelectedLocationIds(initialFilters?.locationIds ?? []);
      setSearchCategory('');
      setSearchProduct('');
      setSearchLocation('');
      setTab('categories');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn:  categoriesService.getAll,
  });

  const { data: products = [] } = useQuery({
    queryKey: ['goods'],
    queryFn:  goodsService.getAll,
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['stock-visible-locations'],
    queryFn:  stockService.getVisibleLocations,
  });

  // Products narrowed to selected categories (hierarchical filter)
  const productsByCategory = useMemo(() => {
    if (!selectedCategoryIds.length) return products;
    return products.filter(p => selectedCategoryIds.includes(p.categoryId));
  }, [products, selectedCategoryIds]);

  // Auto-remove products that no longer belong to the selected categories
  useEffect(() => {
    if (!selectedCategoryIds.length) return;
    setSelectedProductIds(prev =>
      prev.filter(pid =>
        products.some(p => p.id === pid && selectedCategoryIds.includes(p.categoryId))
      )
    );
  }, [selectedCategoryIds, products]);

  // Search-filtered lists
  const visibleCategories = categories.filter(c =>
    c.name.toLowerCase().includes(searchCategory.toLowerCase())
  );
  const visibleProducts = productsByCategory.filter(p =>
    p.name.toLowerCase().includes(searchProduct.toLowerCase())
  );
  const visibleLocations = locations.filter(l =>
    l.name.toLowerCase().includes(searchLocation.toLowerCase())
  );

  const toggleCategory = (id: string) => {
    setSelectedCategoryIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleProduct = (id: string) => {
    setSelectedProductIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleLocation = (id: string) => {
    setSelectedLocationIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectAllCategories = () => setSelectedCategoryIds(visibleCategories.map(c => c.id));
  const selectAllProducts   = () => setSelectedProductIds(visibleProducts.map(p => p.id));
  const selectAllLocations  = () => setSelectedLocationIds(visibleLocations.map(l => l.id));

  const categoryTabLabel = selectedCategoryIds.length > 0
    ? `Categories (${selectedCategoryIds.length})`
    : 'Categories';
  const productTabLabel = selectedProductIds.length > 0
    ? `Products (${selectedProductIds.length})`
    : 'Products';
  const locationTabLabel = selectedLocationIds.length > 0
    ? `Locations (${selectedLocationIds.length})`
    : 'Locations';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Advanced Filter</DialogTitle>

      <DialogContent sx={{ p: 0, minHeight: 440 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Tab label={categoryTabLabel} value="categories" />
          <Tab label={productTabLabel}  value="products" />
          <Tab label={locationTabLabel} value="locations" />
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
              <Button size="small" onClick={selectAllCategories}>
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

        {/* ── Products tab ───────────────────────────────────────────── */}
        {tab === 'products' && (
          <Box sx={{ px: 2, pt: 2 }}>
            {selectedCategoryIds.length > 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                Showing products in {selectedCategoryIds.length === 1 ? 'selected category' : `${selectedCategoryIds.length} selected categories`}
              </Typography>
            )}
            <TextField
              fullWidth size="small" placeholder="Search products..."
              value={searchProduct}
              onChange={(e) => setSearchProduct(e.target.value)}
              sx={{ mb: 1 }}
            />
            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
              <Button size="small" onClick={selectAllProducts}>
                Select All ({visibleProducts.length})
              </Button>
              <Button size="small" onClick={() => setSelectedProductIds([])}>
                Clear Selection
              </Button>
            </Box>
            <List dense sx={{ maxHeight: 300, overflowY: 'auto' }}>
              {visibleProducts.map(p => (
                <ListItem key={p.id} disablePadding>
                  <ListItemButton onClick={() => toggleProduct(p.id)}>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={selectedProductIds.includes(p.id)}
                          size="small"
                        />
                      }
                      label={p.name}
                      onClick={(e) => e.preventDefault()}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
              {visibleProducts.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                  No products found
                </Typography>
              )}
            </List>
          </Box>
        )}

        {/* ── Locations tab ──────────────────────────────────────────── */}
        {tab === 'locations' && (
          <Box sx={{ px: 2, pt: 2 }}>
            <TextField
              fullWidth size="small" placeholder="Search locations..."
              value={searchLocation}
              onChange={(e) => setSearchLocation(e.target.value)}
              sx={{ mb: 1 }}
            />
            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
              <Button size="small" onClick={selectAllLocations}>
                Select All ({visibleLocations.length})
              </Button>
              <Button size="small" onClick={() => setSelectedLocationIds([])}>
                Clear Selection
              </Button>
            </Box>
            <List dense sx={{ maxHeight: 300, overflowY: 'auto' }}>
              {visibleLocations.map(l => (
                <ListItem key={l.id} disablePadding>
                  <ListItemButton onClick={() => toggleLocation(l.id)}>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={selectedLocationIds.includes(l.id)}
                          size="small"
                        />
                      }
                      label={`${l.code} — ${l.name}`}
                      onClick={(e) => e.preventDefault()}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
              {visibleLocations.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                  No locations found
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
            onApply({
              categoryIds: selectedCategoryIds,
              productIds:  selectedProductIds,
              locationIds: selectedLocationIds,
            });
            onClose();
          }}
        >
          Apply
        </Button>
      </DialogActions>
    </Dialog>
  );
}
