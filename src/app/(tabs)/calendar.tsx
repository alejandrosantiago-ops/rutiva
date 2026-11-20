import { useCallback, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Lock } from 'lucide-react-native';
import { formatEs } from '@/domain/dates';
import { dayProgress, getValue, isActive, isScheduledOn, progressRatio } from '@/domain/habits';
import { useLogIndex } from '@/hooks/useLogIndex';
import { useHabitStore } from '@/stores/useHabitStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useSelectedDay, useToday } from '@/hooks/useToday';
import { useTheme } from '@/theme/colors';
import { haptics } from '@/lib/haptics';
import { Screen } from '@/components/ui/layout';
import { Card, EmptyState, PressableScale, SectionHeader, Txt, cx } from '@/components/ui/primitives';
import { ProgressBar } from '@/components/ui/progress';
import { HeatCalendar, HeatLegend } from '@/components/calendar/HeatCalendar';
import { DayHabitList } from '@/components/habits/DayHabitList';
import { habitIcon } from '@/components/habits/habitIcons';

export default function CalendarScreen() {
  const t = useTheme();
  const today = useToday();
  const habits = useHabitStore((s) => s.habits);
  const logs = useLogIndex();
  const weekStartsOn = useSettingsStore((s) => s.settings.weekStartsOn);
  const [selected, setSelected] = useSelectedDay(today);
  const [filter, setFilter] = useState<string | null>(null);

  const active = useMemo(() => habits.filter(isActive), [habits]);
  const focus = active.find((h) => h.id === filter) ?? null;

  const getDay = useCallback(
    (d: string) => {
      if (focus) {
        if (!isScheduledOn(focus, d)) return { ratio: null };
        return { ratio: progressRatio(focus, getValue(logs, focus.id, d)) };
      }
      const p = dayProgress(habits, logs, d);
      return { ratio: p.scheduled ? p.ratio : null };
    },
    [focus, habits, logs],
  );

  const progress = dayProgress(habits, logs, selected);
  const future = selected > today;

  return (
    <Screen subtitle="Tu constancia, día a día" title="Calendario">
      {active.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-5 mt-4" contentContainerClassName="gap-2 px-5">
          {[null, ...active].map((h) => {
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
                )}
                style={isSel ? { backgroundColor: color, borderColor: color } : undefined}
              >
                {Icon ? <Icon size={14} color={isSel ? '#FFFFFF' : color} strokeWidth={2.4} /> : null}
                <Text className={cx('text-[13px] font-semibold', isSel ? 'text-white' : 'text-ink dark:text-ink-dark')}>
                  {h?.name ?? 'Todos'}
                </Text>
              </PressableScale>
            );
          })}
        </ScrollView>
      ) : null}

      <Card className="mt-4 px-2 pb-3">
        <HeatCalendar
          today={today}
          selected={selected}
          onSelect={setSelected}
          getDay={getDay}
          color={focus?.color}
          firstDay={weekStartsOn}
        />
        <HeatLegend color={focus?.color} />
      </Card>

      <SectionHeader title={selected === today ? 'Hoy' : formatEs(selected, "EEEE d 'de' MMMM")} />

      {future ? (
        <EmptyState icon={Lock} title="Día futuro" description="Podrás registrar tus hábitos cuando llegue este día." />
      ) : (
        <>
          {progress.scheduled > 0 ? (
            <Card className="mb-3">
              <View className="mb-2 flex-row items-baseline justify-between">
                <Txt variant="label">
                  {progress.completed} de {progress.scheduled} completados
                </Txt>
                <Txt variant="heading" className="text-brand-500 dark:text-brand-300">
                  {Math.round(progress.ratio * 100)}%
                </Txt>
              </View>
              <ProgressBar progress={progress.ratio} color={progress.ratio >= 1 ? t.success : t.brand} />
            </Card>
          ) : null}
          <DayHabitList date={selected} today={today} />
        </>
      )}
    </Screen>
  );
}
