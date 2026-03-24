import { useState, useEffect } from 'react';
import {
  Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, List, ListItem, ListItemButton, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { goodsService } from '../services/goods.service';
import stockService from '../services/stock.service';

type AdvancedFilterModalProps = {
  open: boolean;
  onClose: () => void;
  onApply: (filters: {
    productIds: string[];
    locationIds: string[];
  }) => void;
  initialFilters?: {
    productIds?: string[];
    locationIds?: string[];
  };
};

export default function AdvancedFilterModal({
  open, onClose, onApply, initialFilters,
}: AdvancedFilterModalProps) {
  const [tab, setTab] = useState<'products' | 'locations'>('products');
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
  const [searchProduct, setSearchProduct] = useState('');
  const [searchLocation, setSearchLocation] = useState('');

  // Reset state each time the modal opens, seeding from initialFilters
  useEffect(() => {
    if (open) {
      setSelectedProductIds(initialFilters?.productIds ?? []);
      setSelectedLocationIds(initialFilters?.locationIds ?? []);
      setSearchProduct('');
      setSearchLocation('');
      setTab('products');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: products = [] } = useQuery({
    queryKey: ['goods'],
    queryFn: goodsService.getAll,
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['stock-visible-locations'],
    queryFn: stockService.getVisibleLocations,
  });

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchProduct.toLowerCase())
  );

  const filteredLocations = locations.filter(l =>
    l.name.toLowerCase().includes(searchLocation.toLowerCase())
  );

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

  const selectAllProducts = () => {
    setSelectedProductIds(filteredProducts.map(p => p.id));
  };

  const selectAllLocations = () => {
    setSelectedLocationIds(filteredLocations.map(l => l.id));
  };

  const productTabLabel = selectedProductIds.length > 0
    ? `Products (${selectedProductIds.length} selected)`
    : 'Products';

  const locationTabLabel = selectedLocationIds.length > 0
    ? `Locations (${selectedLocationIds.length} selected)`
    : 'Locations';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Advanced Filter</DialogTitle>

      <DialogContent sx={{ p: 0, minHeight: 440 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Tab label={productTabLabel} value="products" />
          <Tab label={locationTabLabel} value="locations" />
        </Tabs>

        {tab === 'products' && (
          <Box sx={{ px: 2, pt: 2 }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search products..."
              value={searchProduct}
              onChange={(e) => setSearchProduct(e.target.value)}
              sx={{ mb: 1 }}
            />
            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
              <Button size="small" onClick={selectAllProducts}>
                Select All ({filteredProducts.length})
              </Button>
              <Button size="small" onClick={() => setSelectedProductIds([])}>
                Clear Selection
              </Button>
            </Box>
            <List dense sx={{ maxHeight: 300, overflowY: 'auto' }}>
              {filteredProducts.map(p => (
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
              {filteredProducts.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                  No products found
                </Typography>
              )}
            </List>
          </Box>
        )}

        {tab === 'locations' && (
          <Box sx={{ px: 2, pt: 2 }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search locations..."
              value={searchLocation}
              onChange={(e) => setSearchLocation(e.target.value)}
              sx={{ mb: 1 }}
            />
            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
              <Button size="small" onClick={selectAllLocations}>
                Select All ({filteredLocations.length})
              </Button>
              <Button size="small" onClick={() => setSelectedLocationIds([])}>
                Clear Selection
              </Button>
            </Box>
            <List dense sx={{ maxHeight: 300, overflowY: 'auto' }}>
              {filteredLocations.map(l => (
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
              {filteredLocations.length === 0 && (
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
              productIds: selectedProductIds,
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
