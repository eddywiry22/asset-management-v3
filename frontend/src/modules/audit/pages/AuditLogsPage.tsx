import { useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Collapse, FormControl, IconButton,
  InputLabel, MenuItem, Paper, Select, Table, TableBody, TableCell, TableContainer,
  TableHead, TablePagination, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { useQuery } from '@tanstack/react-query';
import auditLogsService, { AuditLog, AuditEntityType, AuditAction } from '../../../services/auditLogs.service';
import stockService from '../../../services/stock.service';
import { useAuth } from '../../../context/AuthContext';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const ENTITY_TYPES: AuditEntityType[] = [
  'PRODUCT',
  'LOCATION',
  'STOCK_TRANSFER',
  'STOCK_ADJUSTMENT',
  'PRODUCT_LOCATION',
  'USER',
  'CATEGORY',
  'VENDOR',
  'UOM',
  'STOCK_ADJUSTMENT_REQUEST',
  'STOCK_TRANSFER_REQUEST',
];

const ACTIONS: AuditAction[] = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'APPROVE',
  'FINALIZE',
  'CANCEL',
  'STATUS_CHANGE',
  'TRANSFER_CREATE',
  'FINALIZE_BLOCKED',
];

const ACTION_COLORS: Record<string, 'default' | 'success' | 'warning' | 'error' | 'info' | 'primary'> = {
  CREATE:           'success',
  UPDATE:           'info',
  DELETE:           'error',
  APPROVE:          'success',
  FINALIZE:         'primary',
  CANCEL:           'error',
  STATUS_CHANGE:    'warning',
  TRANSFER_CREATE:  'info',
  FINALIZE_BLOCKED: 'error',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleString();
}

function userLabel(u: { email: string | null; phone: string | null } | null | undefined): string {
  if (!u) return '—';
  return u.email ?? u.phone ?? '(unknown)';
}

function summarize(log: AuditLog): string {
  const before = log.beforeSnapshot as any;
  const after  = log.afterSnapshot  as any;
  if (before?.status && after?.status) return `${before.status} → ${after.status}`;
  if (after?.status) return `Status → ${after.status}`;
  if (after?.name)   return `Name: ${after.name}`;
  if (after?.sku)    return `SKU: ${after.sku}`;
  if (after)         return JSON.stringify(after).slice(0, 80);
  return '—';
}

// ---------------------------------------------------------------------------
// Expandable Row
// ---------------------------------------------------------------------------
function AuditLogRow({ log }: { log: AuditLog }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TableRow hover sx={{ '& > *': { borderBottom: 'unset' } }}>
        <TableCell padding="checkbox">
          <Tooltip title={open ? 'Collapse' : 'Expand'}>
            <IconButton size="small" onClick={() => setOpen(!open)}>
              {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
            </IconButton>
          </Tooltip>
        </TableCell>
        <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDate(log.timestamp)}</TableCell>
        <TableCell>{userLabel(log.user)}</TableCell>
        <TableCell>
          <Chip label={log.action} color={ACTION_COLORS[log.action] ?? 'default'} size="small" />
        </TableCell>
        <TableCell>
          <Chip label={log.entityType} size="small" variant="outlined" />
        </TableCell>
        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <Tooltip title={log.entityId}>
            <span>{log.entityId}</span>
          </Tooltip>
        </TableCell>
        <TableCell sx={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {summarize(log)}
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={7} sx={{ py: 0 }}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ m: 2 }}>
              {log.warnings && (
                <Box mb={2}>
                  <Typography variant="subtitle2" color="warning.main" gutterBottom>Warnings</Typography>
                  <Paper variant="outlined" sx={{ p: 1.5 }}>
                    <pre style={{ margin: 0, fontSize: '0.78rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {JSON.stringify(log.warnings, null, 2)}
                    </pre>
                  </Paper>
                </Box>
              )}
              <Box display="flex" gap={2} flexWrap="wrap">
                <Box flex={1} minWidth={280}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>Before Snapshot</Typography>
                  <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'grey.50' }}>
                    <pre style={{ margin: 0, fontSize: '0.78rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {log.beforeSnapshot ? JSON.stringify(log.beforeSnapshot, null, 2) : 'null'}
                    </pre>
                  </Paper>
                </Box>
                <Box flex={1} minWidth={280}>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom>After Snapshot</Typography>
                  <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'grey.50' }}>
                    <pre style={{ margin: 0, fontSize: '0.78rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {log.afterSnapshot ? JSON.stringify(log.afterSnapshot, null, 2) : 'null'}
                    </pre>
                  </Paper>
                </Box>
              </Box>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
type SimpleLocation = { id: string; code: string; name: string };

export default function AuditLogsPage() {
  const { isAdmin } = useAuth();

  const [page, setPage]               = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  // Staging filters — updated on input change, not applied until Apply is clicked
  const [startDate,          setStartDate]          = useState('');
  const [endDate,            setEndDate]            = useState('');
  const [entityTypeFilter,   setEntityTypeFilter]   = useState('');
  const [actionFilter,       setActionFilter]       = useState('');
  const [srcLocationFilter,  setSrcLocationFilter]  = useState('');
  const [destLocationFilter, setDestLocationFilter] = useState('');

  // Applied filters — committed on Apply, drives the query key
  const [appliedFilters, setAppliedFilters] = useState({
    startDate: '', endDate: '', entityType: '', action: '',
    sourceLocationId: '', destinationLocationId: '',
  });

  const { data: allLocationsRes } = useQuery({
    queryKey: ['locations-all'],
    queryFn:  () => stockService.getAllLocations(),
    enabled:  isAdmin,
  });
  const allLocations: SimpleLocation[] = allLocationsRes ?? [];

  const { data, isLoading, error } = useQuery({
    queryKey: ['audit-logs', appliedFilters, page, rowsPerPage],
    queryFn: () => auditLogsService.getAll({
      ...(appliedFilters.startDate           ? { dateStart:            appliedFilters.startDate           } : {}),
      ...(appliedFilters.endDate             ? { dateEnd:              appliedFilters.endDate             } : {}),
      ...(appliedFilters.entityType          ? { entityType:           appliedFilters.entityType          } : {}),
      ...(appliedFilters.action              ? { action:               appliedFilters.action              } : {}),
      ...(appliedFilters.sourceLocationId    ? { sourceLocationId:     appliedFilters.sourceLocationId    } : {}),
      ...(appliedFilters.destinationLocationId ? { destinationLocationId: appliedFilters.destinationLocationId } : {}),
      page:  page + 1,
      limit: rowsPerPage,
    }),
    enabled: isAdmin,
  });

  const isDateRangeInvalid = !!(startDate && endDate && startDate > endDate);

  const rows  = data?.data  ?? [];
  const total = data?.meta?.total ?? 0;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" fontWeight={600}>Audit Logs</Typography>
      </Box>

      {/* Filters — matches Adjustment / Transfer page pattern exactly */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            label="From"
            type="date"
            size="small"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            error={isDateRangeInvalid}
          />
          <TextField
            label="To"
            type="date"
            size="small"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            error={isDateRangeInvalid}
            helperText={isDateRangeInvalid ? 'End date must be after start date' : undefined}
          />
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Entity Type</InputLabel>
            <Select
              label="Entity Type"
              value={entityTypeFilter}
              onChange={(e) => setEntityTypeFilter(e.target.value)}
            >
              <MenuItem value="">All</MenuItem>
              {ENTITY_TYPES.map((t) => (
                <MenuItem key={t} value={t}>{t}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Action</InputLabel>
            <Select
              label="Action"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
            >
              <MenuItem value="">All</MenuItem>
              {ACTIONS.map((a) => (
                <MenuItem key={a} value={a}>{a}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Source Location</InputLabel>
            <Select
              label="Source Location"
              value={srcLocationFilter}
              onChange={(e) => setSrcLocationFilter(e.target.value)}
            >
              <MenuItem value="">All Locations</MenuItem>
              {allLocations.map((l) => (
                <MenuItem key={l.id} value={l.id}>{l.code} — {l.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Destination Location</InputLabel>
            <Select
              label="Destination Location"
              value={destLocationFilter}
              onChange={(e) => setDestLocationFilter(e.target.value)}
            >
              <MenuItem value="">All Locations</MenuItem>
              {allLocations.map((l) => (
                <MenuItem key={l.id} value={l.id}>{l.code} — {l.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            variant="outlined"
            startIcon={<FilterListIcon />}
            disabled={isDateRangeInvalid}
            onClick={() => {
              if (!isDateRangeInvalid) {
                setPage(0);
                setAppliedFilters({
                  startDate:            startDate,
                  endDate:              endDate,
                  entityType:           entityTypeFilter,
                  action:               actionFilter,
                  sourceLocationId:     srcLocationFilter,
                  destinationLocationId: destLocationFilter,
                });
              }
            }}
          >
            Apply
          </Button>
          <Button
            variant="text"
            onClick={() => {
              setStartDate(''); setEndDate(''); setEntityTypeFilter('');
              setActionFilter(''); setSrcLocationFilter(''); setDestLocationFilter('');
              setPage(0);
              setAppliedFilters({
                startDate: '', endDate: '', entityType: '', action: '',
                sourceLocationId: '', destinationLocationId: '',
              });
            }}
          >
            Clear
          </Button>
        </Box>
      </Paper>

      {/* Table */}
      {isLoading && <CircularProgress />}
      {error     && <Alert severity="error">Failed to load audit logs.</Alert>}
      {!isLoading && !error && (
        <Paper>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell width={48} />
                  <TableCell>Timestamp</TableCell>
                  <TableCell>User</TableCell>
                  <TableCell>Action</TableCell>
                  <TableCell>Entity Type</TableCell>
                  <TableCell>Entity ID</TableCell>
                  <TableCell>Summary</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center">No audit logs found.</TableCell>
                  </TableRow>
                ) : (
                  rows.map((log) => <AuditLogRow key={log.id} log={log} />)
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(_e, p) => setPage(p)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
            rowsPerPageOptions={[10, 20, 50]}
          />
        </Paper>
      )}
    </Box>
  );
}
