import { useCallback, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { endOfMonth } from 'date-fns';
import { ChevronDown, ChevronUp, Lock, Pencil } from 'lucide-react-native';
import { formatEs, fromKey, rangeKeys, toKey } from '@/domain/dates';
import { dayProgress, getValue, isActive, isPausedOn, isScheduledOn, progressRatio } from '@/domain/habits';
import { useHabitStore } from '@/stores/useHabitStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useLogIndex } from '@/hooks/useLogIndex';
import { useSelectedDay, useToday } from '@/hooks/useToday';
import { useTheme } from '@/theme/colors';
import { haptics } from '@/lib/haptics';
import { Screen } from '@/components/ui/layout';
import { Card, EmptyState, PressableScale, SectionHeader, Txt, cx } from '@/components/ui/primitives';
import { HeatCalendar, HeatLegend } from '@/components/calendar/HeatCalendar';
import { DaySummary } from '@/components/calendar/DaySummary';
import { DayHabitList } from '@/components/habits/DayHabitList';
import { habitIcon } from '@/components/habits/habitIcons';

export default function CalendarScreen() {
  const t = useTheme();
  const today = useToday();
  const habits = useHabitStore((s) => s.habits);
  const logs = useLogIndex();
  const weekStartsOn = useSettingsStore((s) => s.settings.weekStartsOn);
  const [selected, setSelected] = useSelectedDay(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [filter, setFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  // Se puede filtrar por cualquier hábito con historial, también archivados.
  const filterable = useMemo(() => habits.filter((h) => !h.deletedAt), [habits]);
  const focus = filterable.find((h) => h.id === filter) ?? null;

  const getDay = useCallback(
    (d: string) => {
      if (focus) {
        if (isPausedOn(focus, d) && d >= focus.startDate) return { ratio: null, paused: true };
        if (!isScheduledOn(focus, d)) return { ratio: null };
        return { ratio: progressRatio(focus, getValue(logs, focus.id, d), d) };
      }
      const p = dayProgress(habits, logs, d);
      return { ratio: p.scheduled ? p.ratio : null };
    },
    [focus, habits, logs],
  );

  // Resumen del mes visible (solo hasta hoy).
  const monthStats = useMemo(() => {
    const start = `${month}-01`;
    const end = toKey(endOfMonth(fromKey(start)));
    const last = end > today ? today : end;
    let full = 0;
    let partial = 0;
    let missed = 0;
    let sum = 0;
    let n = 0;
    if (start <= last) {
      for (const d of rangeKeys(start, last)) {
        const { ratio } = getDay(d);
        if (ratio === null || (d === today && ratio < 1)) continue;
        n++;
        sum += ratio;
        if (ratio >= 1) full++;
        else if (ratio > 0) partial++;
        else missed++;
      }
    }
    return { full, partial, missed, avg: n ? sum / n : null };
  }, [month, today, getDay]);

  const future = selected > today;

  return (
    <Screen subtitle="Tu constancia, día a día" title="Calendario">
      {filterable.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-5 mt-4" contentContainerClassName="gap-2 px-5">
          {[null, ...filterable].map((h) => {
            const isSel = (h?.id ?? null) === filter;
            const Icon = h ? habitIcon(h.icon) : null;
            const color = h?.color ?? t.brand;
            return (
              <PressableScale
                key={h?.id ?? 'all'}
                scaleTo={0.94}
                onPress={() => {
                  haptics.selection();
                  setFilter(h?.id ?? null);
                }}
                className={cx(
                  'h-9 flex-row items-center gap-1.5 rounded-full border px-3.5',
                  !isSel && 'border-line bg-card dark:border-line-dark dark:bg-card-dark',
                  h && !isActive(h) && !isSel && 'opacity-60',
                )}
                style={isSel ? { backgroundColor: color, borderColor: color } : undefined}
              >
                {Icon ? <Icon size={14} color={isSel ? '#FFFFFF' : color} strokeWidth={2.4} /> : null}
                <Text className={cx('text-[13px] font-semibold', isSel ? 'text-white' : 'text-ink dark:text-ink-dark')}>{h?.name ?? 'Todos'}</Text>
              </PressableScale>
            );
          })}
        </ScrollView>
      ) : null}

      <Card className="mt-4 px-2 pb-3">
        <HeatCalendar
          today={today}
          selected={selected}
          onSelect={(d) => {
            setSelected(d);
            setEditing(false);
          }}
          onMonthChange={(m) => setMonth(m.slice(0, 7))}
          getDay={getDay}
          color={focus?.color}
          firstDay={weekStartsOn}
        />
        <HeatLegend color={focus?.color} showPaused={!!focus} />
      </Card>

      {/* Resumen del mes */}
      <View className="mt-3 flex-row items-center justify-between px-1">
        <Txt variant="caption">
          {formatEs(`${month}-01`, 'MMMM')}: {monthStats.full} completos · {monthStats.partial} parciales · {monthStats.missed} sin cumplir
        </Txt>
        <View className="flex-row items-center gap-3">
          {monthStats.avg !== null ? <Txt variant="label">{Math.round(monthStats.avg * 100)}%</Txt> : null}
          {selected !== today ? (
            <PressableScale onPress={() => setSelected(today)}>
              <Text className="text-[13px] font-semibold text-brand-500 dark:text-brand-300">Hoy</Text>
            </PressableScale>
          ) : null}
        </View>
      </View>

      <SectionHeader title={selected === today ? 'Hoy' : formatEs(selected, "EEEE d 'de' MMMM yyyy")} />

      {future ? (
        <EmptyState icon={Lock} title="Día futuro" description="Podrás registrar tus hábitos cuando llegue este día." />
      ) : (
        <>
          <DaySummary date={selected} today={today} habits={habits} logs={logs} focusId={filter} />
          <PressableScale onPress={() => setEditing((e) => !e)} className="mt-3 flex-row items-center justify-center gap-1.5 py-2">
            <Pencil size={14} color={t.brand} />
            <Text className="text-[13px] font-semibold text-brand-500 dark:text-brand-300">
              {editing ? 'Ocultar registro' : selected === today ? 'Registrar hábitos de hoy' : 'Corregir registros de este día'}
            </Text>
            {editing ? <ChevronUp size={14} color={t.brand} /> : <ChevronDown size={14} color={t.brand} />}
          </PressableScale>
          {editing ? (
            <View className="mt-2">
              <DayHabitList date={selected} today={today} />
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}
