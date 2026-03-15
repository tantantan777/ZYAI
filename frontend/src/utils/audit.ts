import api from './api';

type ClientAuditAction = 'add' | 'edit' | 'delete';

type ClientAuditPayload = {
  actionType: ClientAuditAction;
  targetType: string;
  targetName: string;
  detail?: string;
};

export async function logClientAudit(payload: ClientAuditPayload) {
  try {
    await api.post('/system-logs/client-event', payload);
  } catch (error) {
    console.error('记录系统日志失败:', error);
  }
}

export function logClientAuditAsync(payload: ClientAuditPayload) {
  void logClientAudit(payload);
}
