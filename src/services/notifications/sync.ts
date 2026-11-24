import type { PlannedReminder, ReminderTrigger } from '@/domain/reminders';
import type { TimeOfDay } from '@/domain/types';

/** Lo mínimo que necesitamos del sistema de notificaciones (inyectable en tests). */
export interface NotificationGateway {
  schedule(content: { title: string; body: string; data?: Record<string, unknown> }, trigger: ReminderTrigger): Promise<string>;
  cancel(id: string): Promise<void>;
}

/**
 * Aplica un plan de recordatorios: cancela SIEMPRE los avisos anteriores y
 * programa los nuevos. Devuelve los ids agrupados por hora, para guardarlos
 * junto a cada alarma. Editar = cancelar + programar; desactivar = plan vacío.
 */
export async function applyReminderPlan(
  gateway: NotificationGateway,
  previousIds: string[],
  plan: PlannedReminder[],
  content: { title: string; body: string; data?: Record<string, unknown> },
): Promise<Record<TimeOfDay, string[]>> {
  await Promise.all(previousIds.map((id) => gateway.cancel(id).catch(() => undefined)));
  const byTime: Record<TimeOfDay, string[]> = {};
  for (const p of plan) {
    const id = await gateway.schedule(content, p.trigger);
    (byTime[p.time] ??= []).push(id);
  }
  return byTime;
}
