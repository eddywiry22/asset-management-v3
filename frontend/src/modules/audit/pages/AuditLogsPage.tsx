import { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
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
  CREATE:          'success',
  UPDATE:          'info',
  DELETE:          'error',
  APPROVE:         'success',
  FINALIZE:        'primary',
  CANCEL:          'error',
  STATUS_CHANGE:   'warning',
  TRANSFER_CREATE: 'info',
  FINALIZE_BLOCKED:'error',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtDate(d: string): string {
  return new Date(d).toLocaleString();
}

function userLabel(u: { email: string | null; phone: string | null } | null | undefined): string {
  if (!u) return '—';
  return u.email ?? u.phone ?? '(unknown)';
}

function summarize(log: AuditLog): string {
  const snap = log.afterSnapshot as any;
  if (!snap) return '—';
  if (snap.status) return `Status → ${snap.status}`;
  if (snap.name)   return `Name: ${snap.name}`;
  if (snap.sku)    return `SKU: ${snap.sku}`;
  return JSON.stringify(snap).slice(0, 80);
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
          <Chip
            label={log.action}
            color={ACTION_COLORS[log.action] ?? 'default'}
            size="small"
          />
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
                  <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'warning.50', borderColor: 'warning.light' }}>
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
export default function AuditLogsPage() {
  const { isAdmin } = useAuth();

  const [page, setPage]           = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  // Staging filters (not yet applied)
  const [startDate,     setStartDate]     = useState('');
  const [endDate,       setEndDate]       = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [actionFilter,  setActionFilter]  = useState('');
  const [locationFilter, setLocationFilter] = useState('');

  // Applied filters (sent to API)
  const [applied, setApplied] = useState({
    startDate: '', endDate: '', entityType: '', action: '', locationId: '',
  });

  const { data: locationsRes } = useQuery({
    queryKey: ['locations-all'],
    queryFn:  () => stockService.getAllLocations(),
    enabled:  isAdmin,
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['audit-logs', applied, page, rowsPerPage],
    queryFn: () => auditLogsService.getAll({
      dateStart:  applied.startDate  || undefined,
      dateEnd:    applied.endDate    || undefined,
      entityType: applied.entityType || undefined,
      action:     applied.action     || undefined,
      locationId: applied.locationId || undefined,
      page:       page + 1,
      limit:      rowsPerPage,
    }),
    enabled: isAdmin,
  });

  function applyFilters() {
    setPage(0);
    setApplied({
      startDate:  startDate,
      endDate:    endDate,
      entityType: entityTypeFilter,
      action:     actionFilter,
      locationId: locationFilter,
    });
  }

  function clearFilters() {
    setStartDate('');
    setEndDate('');
    setEntityTypeFilter('');
    setActionFilter('');
    setLocationFilter('');
    setPage(0);
    setApplied({ startDate: '', endDate: '', entityType: '', action: '', locationId: '' });
  }

  const logs  = data?.data ?? [];
  const total = data?.meta.total ?? 0;

  if (!isAdmin) {
    return (
      <Box p={4}>
        <Typography color="error">403 — Admin access required.</Typography>
      </Box>
    );
  }

  return (
    <Box p={3}>
      <Typography variant="h5" fontWeight={600} mb={2}>Audit Logs</Typography>

      {/* Filters */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Box display="flex" alignItems="center" gap={1} mb={1.5}>
          <FilterListIcon fontSize="small" color="action" />
          <Typography variant="subtitle2">Filters</Typography>
        </Box>
        <Box display="flex" gap={2} flexWrap="wrap" alignItems="flex-end">
          <TextField
            label="Date From"
            type="datetime-local"
            size="small"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 200 }}
          />
          <TextField
            label="Date To"
            type="datetime-local"
            size="small"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 200 }}
          />
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Entity Type</InputLabel>
            <Select
              value={entityTypeFilter}
              label="Entity Type"
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
              value={actionFilter}
              label="Action"
              onChange={(e) => setActionFilter(e.target.value)}
            >
              <MenuItem value="">All</MenuItem>
              {ACTIONS.map((a) => (
                <MenuItem key={a} value={a}>{a}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Location</InputLabel>
            <Select
              value={locationFilter}
              label="Location"
              onChange={(e) => setLocationFilter(e.target.value)}
            >
              <MenuItem value="">All</MenuItem>
              {(locationsRes?.data ?? []).map((loc: any) => (
                <MenuItem key={loc.id} value={loc.id}>{loc.code} — {loc.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Box display="flex" gap={1}>
            <Button variant="contained" size="small" onClick={applyFilters}>Apply</Button>
            <Button variant="outlined"  size="small" onClick={clearFilters}>Clear</Button>
          </Box>
        </Box>
      </Paper>

      {/* Table */}
      <Paper variant="outlined">
        {isLoading && (
          <Box display="flex" justifyContent="center" p={4}>
            <CircularProgress />
          </Box>
        )}
        {isError && (
          <Box p={3}>
            <Typography color="error">Failed to load audit logs.</Typography>
          </Box>
        )}
        {!isLoading && !isError && (
          <>
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
                  {logs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                        No audit logs found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    logs.map((log) => <AuditLogRow key={log.id} log={log} />)
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={total}
              page={page}
              onPageChange={(_e, newPage) => setPage(newPage)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
              rowsPerPageOptions={[10, 20, 50]}
            />
          </>
        )}
      </Paper>
    </Box>
  );
}
