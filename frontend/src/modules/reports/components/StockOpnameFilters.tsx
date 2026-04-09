import {
  Box,
  Button,
  Checkbox,
  Chip,
  FormControl,
  InputLabel,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Select,
  SelectChangeEvent,
  TextField,
} from '@mui/material';

export interface StockOpnameFilterState {
  startDate: string;
  endDate: string;
  locationIds: string[];
  categoryIds: string[];
}

export interface FilterOption {
  id: string;
  label: string;
}

interface Props {
  value: StockOpnameFilterState;
  onChange: (next: StockOpnameFilterState) => void;
  locationOptions: FilterOption[];
  categoryOptions: FilterOption[];
  onPreview: () => void;
  onDownload: () => void;
  previewDisabled?: boolean;
  downloadDisabled?: boolean;
}

const SELECT_WIDTH = 220;

export default function StockOpnameFilters({
  value,
  onChange,
  locationOptions,
  categoryOptions,
  onPreview,
  onDownload,
  previewDisabled,
  downloadDisabled,
}: Props) {
  const isDateInvalid =
    !!value.startDate && !!value.endDate && value.startDate > value.endDate;
  const isDateMissing = !value.startDate || !value.endDate;

  const handleLocChange = (e: SelectChangeEvent<string[]>) => {
    const v = e.target.value;
    onChange({ ...value, locationIds: typeof v === 'string' ? v.split(',') : v });
  };

  const handleCatChange = (e: SelectChangeEvent<string[]>) => {
    const v = e.target.value;
    onChange({ ...value, categoryIds: typeof v === 'string' ? v.split(',') : v });
  };

  const locLabelFor = (id: string) =>
    locationOptions.find((o) => o.id === id)?.label ?? id;
  const catLabelFor = (id: string) =>
    categoryOptions.find((o) => o.id === id)?.label ?? id;

  return (
    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <TextField
        label="Start Date"
        type="date"
        size="small"
        required
        InputLabelProps={{ shrink: true }}
        value={value.startDate}
        onChange={(e) => onChange({ ...value, startDate: e.target.value })}
        error={isDateInvalid}
        helperText={isDateInvalid ? 'Start must be before end' : ' '}
      />
      <TextField
        label="End Date"
        type="date"
        size="small"
        required
        InputLabelProps={{ shrink: true }}
        value={value.endDate}
        onChange={(e) => onChange({ ...value, endDate: e.target.value })}
        error={isDateInvalid}
        helperText={' '}
      />

      <FormControl size="small" sx={{ minWidth: SELECT_WIDTH, maxWidth: 320 }}>
        <InputLabel>Locations (all)</InputLabel>
        <Select
          multiple
          value={value.locationIds}
          onChange={handleLocChange}
          input={<OutlinedInput label="Locations (all)" />}
          renderValue={(selected) => (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {selected.map((id) => (
                <Chip key={id} label={locLabelFor(id)} size="small" />
              ))}
            </Box>
          )}
        >
          {locationOptions.map((o) => (
            <MenuItem key={o.id} value={o.id}>
              <Checkbox checked={value.locationIds.includes(o.id)} />
              <ListItemText primary={o.label} />
            </MenuItem>
          ))}
          {locationOptions.length === 0 && (
            <MenuItem disabled>No locations</MenuItem>
          )}
        </Select>
      </FormControl>

      <FormControl size="small" sx={{ minWidth: SELECT_WIDTH, maxWidth: 320 }}>
        <InputLabel>Categories (all)</InputLabel>
        <Select
          multiple
          value={value.categoryIds}
          onChange={handleCatChange}
          input={<OutlinedInput label="Categories (all)" />}
          renderValue={(selected) => (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {selected.map((id) => (
                <Chip key={id} label={catLabelFor(id)} size="small" />
              ))}
            </Box>
          )}
        >
          {categoryOptions.map((o) => (
            <MenuItem key={o.id} value={o.id}>
              <Checkbox checked={value.categoryIds.includes(o.id)} />
              <ListItemText primary={o.label} />
            </MenuItem>
          ))}
          {categoryOptions.length === 0 && (
            <MenuItem disabled>No categories</MenuItem>
          )}
        </Select>
      </FormControl>

      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 0.5 }}>
        <Button
          variant="contained"
          onClick={onPreview}
          disabled={previewDisabled || isDateInvalid || isDateMissing}
        >
          Preview
        </Button>
        <Button variant="outlined" onClick={onDownload} disabled={downloadDisabled}>
          Download
        </Button>
      </Box>
    </Box>
  );
}
