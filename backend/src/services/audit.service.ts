import prisma from '../config/database';

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'STATUS_CHANGE';
export type AuditEntityType = 'CATEGORY' | 'VENDOR' | 'UOM' | 'GOODS';

export interface CreateAuditLogInput {
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  beforeValue?: object | null;
  afterValue?: object | null;
  performedBy: string;
}

export class AuditService {
  async log(input: CreateAuditLogInput): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          entityType:  input.entityType,
          entityId:    input.entityId,
          action:      input.action,
          beforeValue: input.beforeValue ?? undefined,
          afterValue:  input.afterValue ?? undefined,
          performedBy: input.performedBy,
        },
      });
    } catch (err) {
      // Audit logging must never fail the main operation
      console.error('Audit log write failed:', err);
    }
  }
}

export const auditService = new AuditService();
