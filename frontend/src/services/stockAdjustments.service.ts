import apiClient from '../api/client';

export type AdjustmentRequestStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'FINALIZED'
  | 'CANCELLED';

export type AdjustmentItemUser = {
  id: string;
  email: string | null;
  phone: string | null;
};

export type AdjustmentItem = {
  id: string;
  requestId: string;
  productId: string;
  locationId: string;
  qtyChange: number;
  reason: string | null;
  createdAt: string;
  product: { id: string; sku: string; name: string; uom: { code: string } };
  location: { id: string; code: string; name: string };
};

export type AdjustmentRequest = {
  id: string;
  requestNumber: string;
  status: AdjustmentRequestStatus;
  notes: string | null;
  createdById: string;
  approvedById: string | null;
  finalizedById: string | null;
  cancelledById: string | null;
  rejectedById: string | null;
  approvedAt: string | null;
  finalizedAt: string | null;
  cancelledAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: AdjustmentItemUser;
  approvedBy: AdjustmentItemUser | null;
  finalizedBy: AdjustmentItemUser | null;
  cancelledBy: AdjustmentItemUser | null;
  rejectedBy: AdjustmentItemUser | null;
  items: AdjustmentItem[];
};

export type PaginatedResponse<T> = {
  success: boolean;
  data: T[];
  meta: { page: number; limit: number; total: number };
};

export type CreateRequestPayload = {
  notes?: string;
};

export type AddItemPayload = {
  productId: string;
  locationId: string;
  qtyChange: number;
  reason?: string;
};

export type UpdateItemPayload = Partial<AddItemPayload>;

const stockAdjustmentsService = {
  getAll(params: {
    status?: AdjustmentRequestStatus;
    startDate?: string;
    endDate?: string;
    locationId?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<PaginatedResponse<AdjustmentRequest>> {
    const query = new URLSearchParams();
    if (params.status)     query.set('status',     params.status);
    if (params.startDate)  query.set('startDate',  params.startDate);
    if (params.endDate)    query.set('endDate',     params.endDate);
    if (params.locationId) query.set('locationId',  params.locationId);
    if (params.page)       query.set('page',        String(params.page));
    if (params.limit)      query.set('limit',       String(params.limit));
    return apiClient.get(`stock-adjustments?${query}`).then((r) => r.data);
  },

  getById(id: string): Promise<{ success: boolean; data: AdjustmentRequest }> {
    return apiClient.get(`stock-adjustments/${id}`).then((r) => r.data);
  },

  create(payload: CreateRequestPayload): Promise<{ success: boolean; data: AdjustmentRequest }> {
    return apiClient.post('stock-adjustments', payload).then((r) => r.data);
  },

  addItem(requestId: string, payload: AddItemPayload): Promise<{ success: boolean; data: AdjustmentItem }> {
    return apiClient.post(`stock-adjustments/${requestId}/items`, payload).then((r) => r.data);
  },

  updateItem(requestId: string, itemId: string, payload: UpdateItemPayload): Promise<{ success: boolean; data: AdjustmentItem }> {
    return apiClient.put(`stock-adjustments/${requestId}/items/${itemId}`, payload).then((r) => r.data);
  },

  deleteItem(requestId: string, itemId: string): Promise<void> {
    return apiClient.delete(`stock-adjustments/${requestId}/items/${itemId}`).then(() => undefined);
  },

  submit(requestId: string): Promise<{ success: boolean; data: AdjustmentRequest }> {
    return apiClient.post(`stock-adjustments/${requestId}/submit`).then((r) => r.data);
  },

  approve(requestId: string): Promise<{ success: boolean; data: AdjustmentRequest }> {
    return apiClient.post(`stock-adjustments/${requestId}/approve`).then((r) => r.data);
  },

  reject(requestId: string, reason: string): Promise<{ success: boolean; data: AdjustmentRequest }> {
    return apiClient.post(`stock-adjustments/${requestId}/reject`, { reason }).then((r) => r.data);
  },

  finalize(requestId: string): Promise<{ success: boolean; data: AdjustmentRequest }> {
    return apiClient.post(`stock-adjustments/${requestId}/finalize`).then((r) => r.data);
  },

  cancel(requestId: string, reason: string): Promise<{ success: boolean; data: AdjustmentRequest }> {
    return apiClient.post(`stock-adjustments/${requestId}/cancel`, { reason }).then((r) => r.data);
  },
};

export default stockAdjustmentsService;
