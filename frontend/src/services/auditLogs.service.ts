import apiClient from '../api/client';

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'APPROVE'
  | 'FINALIZE'
  | 'CANCEL'
  | 'STATUS_CHANGE'
  | 'TRANSFER_CREATE'
  | 'FINALIZE_BLOCKED';

export type AuditEntityType =
  | 'PRODUCT'
  | 'LOCATION'
  | 'STOCK_TRANSFER'
  | 'STOCK_ADJUSTMENT'
  | 'PRODUCT_LOCATION'
  | 'USER'
  | 'CATEGORY'
  | 'VENDOR'
  | 'UOM'
  | 'STOCK_ADJUSTMENT_REQUEST'
  | 'STOCK_TRANSFER_REQUEST';

export type AuditLogUser = {
  id: string;
  email: string | null;
  phone: string | null;
};

export type AuditLog = {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  timestamp: string;
  beforeSnapshot: object | null;
  afterSnapshot: object | null;
  warnings: object | null;
  user: AuditLogUser;
};

export type AuditLogFilters = {
  dateStart?: string;
  dateEnd?: string;
  userId?: string;
  entityType?: string;
  action?: string;
  locationId?: string;
  page?: number;
  limit?: number;
};

export type AuditLogListResponse = {
  data: AuditLog[];
  meta: {
    total: number;
    page: number;
    limit: number;
  };
};

const auditLogsService = {
  async getAll(filters: AuditLogFilters = {}): Promise<AuditLogListResponse> {
    const params: Record<string, string> = {};
    if (filters.dateStart)  params.dateStart  = filters.dateStart;
    if (filters.dateEnd)    params.dateEnd    = filters.dateEnd;
    if (filters.userId)     params.userId     = filters.userId;
    if (filters.entityType) params.entityType = filters.entityType;
    if (filters.action)     params.action     = filters.action;
    if (filters.locationId) params.locationId = filters.locationId;
    if (filters.page)       params.page       = String(filters.page);
    if (filters.limit)      params.limit      = String(filters.limit);

    const res = await apiClient.get('/admin/audit-logs', { params });
    return res.data;
  },
};

export default auditLogsService;
