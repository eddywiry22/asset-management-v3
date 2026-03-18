import apiClient from '../api/client';

export type TransferRequestStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'ORIGIN_MANAGER_APPROVED'
  | 'DESTINATION_OPERATOR_APPROVED'
  | 'READY_TO_FINALIZE'
  | 'FINALIZED'
  | 'CANCELLED'
  | 'REJECTED';

export type TransferUser = {
  id: string;
  email: string | null;
  phone: string | null;
};

export type TransferItem = {
  id: string;
  requestId: string;
  productId: string;
  qty: number;
  createdAt: string;
  product: { id: string; sku: string; name: string; uom: { code: string } };
  isActiveNow?: boolean;
};

export type TransferRequest = {
  id: string;
  requestNumber: string;
  status: TransferRequestStatus;
  sourceLocationId: string;
  destinationLocationId: string;
  notes: string | null;
  createdById: string;
  submittedAt: string | null;
  originApprovedById: string | null;
  originApprovedAt: string | null;
  destinationApprovedById: string | null;
  destinationApprovedAt: string | null;
  finalizedAt: string | null;
  cancelledById: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  rejectedById: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: TransferUser;
  originApprovedBy: TransferUser | null;
  destinationApprovedBy: TransferUser | null;
  cancelledBy: TransferUser | null;
  rejectedBy: TransferUser | null;
  sourceLocation: { id: string; code: string; name: string };
  destinationLocation: { id: string; code: string; name: string };
  items: TransferItem[];
};

export type PaginatedResponse<T> = {
  success: boolean;
  data: T[];
  meta: { page: number; limit: number; total: number };
};

export type CreateTransferPayload = {
  sourceLocationId: string;
  destinationLocationId: string;
  notes?: string;
};

export type AddItemPayload = {
  productId: string;
  qty: number;
};

export type UpdateItemPayload = {
  qty: number;
};

const stockTransfersService = {
  getAll(params: {
    status?: TransferRequestStatus;
    startDate?: string;
    endDate?: string;
    locationId?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<PaginatedResponse<TransferRequest>> {
    const query = new URLSearchParams();
    if (params.status)     query.set('status',     params.status);
    if (params.startDate)  query.set('startDate',  params.startDate);
    if (params.endDate)    query.set('endDate',     params.endDate);
    if (params.locationId) query.set('locationId',  params.locationId);
    if (params.page)       query.set('page',        String(params.page));
    if (params.limit)      query.set('limit',       String(params.limit));
    return apiClient.get(`stock-transfers?${query}`).then((r) => r.data);
  },

  getById(id: string): Promise<{ success: boolean; data: TransferRequest }> {
    return apiClient.get(`stock-transfers/${id}`).then((r) => r.data);
  },

  create(payload: CreateTransferPayload): Promise<{ success: boolean; data: TransferRequest }> {
    return apiClient.post('stock-transfers', payload).then((r) => r.data);
  },

  deleteRequest(id: string): Promise<void> {
    return apiClient.delete(`stock-transfers/${id}`).then(() => undefined);
  },

  addItem(requestId: string, payload: AddItemPayload): Promise<{ success: boolean; data: TransferItem }> {
    return apiClient.post(`stock-transfers/${requestId}/items`, payload).then((r) => r.data);
  },

  updateItem(requestId: string, itemId: string, payload: UpdateItemPayload): Promise<{ success: boolean; data: TransferItem }> {
    return apiClient.put(`stock-transfers/${requestId}/items/${itemId}`, payload).then((r) => r.data);
  },

  deleteItem(requestId: string, itemId: string): Promise<void> {
    return apiClient.delete(`stock-transfers/${requestId}/items/${itemId}`).then(() => undefined);
  },

  submit(requestId: string): Promise<{ success: boolean; data: TransferRequest }> {
    return apiClient.post(`stock-transfers/${requestId}/submit`).then((r) => r.data);
  },

  approveOrigin(requestId: string): Promise<{ success: boolean; data: TransferRequest }> {
    return apiClient.post(`stock-transfers/${requestId}/approve-origin`).then((r) => r.data);
  },

  approveDestination(requestId: string): Promise<{ success: boolean; data: TransferRequest }> {
    return apiClient.post(`stock-transfers/${requestId}/approve-destination`).then((r) => r.data);
  },

  finalize(requestId: string): Promise<{ success: boolean; data: TransferRequest }> {
    return apiClient.post(`stock-transfers/${requestId}/finalize`).then((r) => r.data);
  },

  reject(requestId: string, reason: string): Promise<{ success: boolean; data: TransferRequest }> {
    return apiClient.post(`stock-transfers/${requestId}/reject`, { reason }).then((r) => r.data);
  },

  cancel(requestId: string, reason: string): Promise<{ success: boolean; data: TransferRequest }> {
    return apiClient.post(`stock-transfers/${requestId}/cancel`, { reason }).then((r) => r.data);
  },
};

export default stockTransfersService;
