import prisma from '../config/database';

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'APPROVE'
  | 'FINALIZE'
  | 'CANCEL'
  | 'STATUS_CHANGE'
  | 'TRANSFER_CREATE'
  | 'FINALIZE_BLOCKED'
  | 'BLOCKED'
  | 'USER_PASSWORD_RESET'
  | 'RETIRE'
  | 'SKU_RENAME';

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
  | 'GOODS'
  | 'STOCK_ADJUSTMENT_REQUEST'
  | 'STOCK_TRANSFER_REQUEST';

export interface CreateAuditLogInput {
  /** New canonical field name */
  userId?: string;
  /** Legacy alias for userId — accepted for backward compatibility */
  performedBy?: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  /** New canonical field name */
  beforeSnapshot?: object | null;
  /** Legacy alias for beforeSnapshot */
  beforeValue?: object | null;
  /** New canonical field name */
  afterSnapshot?: object | null;
  /** Legacy alias for afterSnapshot */
  afterValue?: object | null;
  warnings?: object[] | null;
}

export class AuditService {
  async log(input: CreateAuditLogInput): Promise<void> {
    try {
      // Support legacy field names
      const userId = input.userId ?? input.performedBy;
      const beforeSnapshot = input.beforeSnapshot ?? input.beforeValue;
      const afterSnapshot = input.afterSnapshot ?? input.afterValue;

      await prisma.auditLog.create({
        data: {
          userId:         userId!,
          action:         input.action,
          entityType:     input.entityType,
          entityId:       input.entityId,
          beforeSnapshot: beforeSnapshot ?? undefined,
          afterSnapshot:  afterSnapshot ?? undefined,
          warnings:       input.warnings ?? undefined,
        },
      });
    } catch (err) {
      // Audit logging must never fail the main operation
      console.error('Audit log write failed:', err);
    }
  }
}

export const auditService = new AuditService();
