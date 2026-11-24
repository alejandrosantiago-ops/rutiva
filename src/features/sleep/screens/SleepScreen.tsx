import { useWakeStore } from '@/features/alarm/store/useWakeStore';
import { describeUntil, nextWakeAt } from '@/domain/wake';
import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  AlarmClock,
  BedDouble,
  Bell,
  CalendarDays,
  HeartPulse,
  Moon,
  Plus,
  Scale,
  Star,
  Sun,
  Target,
  TrendingDown,
  X,
} from 'lucide-react-native';
import { formatDurationShort, formatEs, formatIsoTime, minutesToTime, shiftKey } from '@/domain/dates';
import { compareWithGoal, logsInRange, QUALITY_LABELS, SOURCE_LABELS, sleepSeries, summarizeSleep } from '@/domain/sleep';
import { useSleepStore } from '@/features/sleep/store/useSleepStore';
import { useSettingsStore } from '@/features/settings/store/useSettingsStore';
import { useSleepSessionStore } from '@/features/sleep/store/sleepSession';
import { toast } from '@/ui/toast';
import { syncBedtimeReminder } from '@/features/sleep/store/bedtimeReminder';
import { useToday } from '@/hooks/useToday';
import { useTheme } from '@/theme/colors';
import { haptics } from '@/lib/haptics';
import { confirmAction, showAlert } from '@/lib/dialogs';
import { notificationsSupported } from '@/services/notifications';
import { platformHealthProvider } from '@/services/health/providers';
import { Screen } from '@/ui/layout';
import { Button, Card, EmptyState, IconButton, PressableScale, SectionHeader, StatTile, Txt } from '@/ui/primitives';
import { ProgressRing } from '@/ui/progress';
import { ListRow, Segmented, Stepper, TimeField, Toggle } from '@/ui/form';
import { SleepChart } from '@/features/sleep/components/SleepChart';

type Range = '7' | '30';
const PAGE = 20;

function QualityStars({ value, size = 13 }: { value: number; size?: number }) {
  const t = useTheme();
  return (
    <View className="flex-row gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} color={t.warning} fill={i <= value ? t.warning : 'transparent'} strokeWidth={2} />
      ))}
    </View>
  );
}

function signed(min: number) {
  const abs = formatDurationShort(Math.abs(min));
  return min >= 0 ? `+${abs}` : `−${abs}`;
}

/** Tarjeta del temporizador: "Voy a dormir" / "Me desperté". */
function SleepTimerCard() {
  const t = useTheme();
  const session = useSleepSessionStore((s) => s.session);
  const { start, discard } = useSleepSessionStore.getState();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!session) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [session]);

  if (!session) {
    return (
      <Card className="mt-4 flex-row items-center gap-4">
        <View className="h-12 w-12 items-center justify-center rounded-2xl bg-sleep/15">
          <Moon size={22} color={t.sleep} />
        </View>
        <View className="flex-1">
          <Txt variant="heading">¿Te vas a dormir?</Txt>
          <Txt variant="caption" className="mt-0.5">
            Guarda la hora exacta y pulsa «Me desperté» al levantarte.
          </Txt>
        </View>
        <Button
          size="sm"
          title="Voy a dormir"
          onPress={() => {
            haptics.success();
            setNow(Date.now());
            start()
              .then(() => toast('Que descanses. Pulsa «Me desperté» al levantarte.'))
              .catch(() => toast('No se pudo iniciar la sesión', { tone: 'error' }));
          }}
        />
      </Card>
    );
  }

  const elapsed = Math.max(0, Math.round((now - new Date(session.startedAt).getTime()) / 60000));
  return (
    <View className="mt-4 rounded-4xl p-5" style={{ backgroundColor: t.scheme === 'dark' ? '#221D4A' : '#EEEBFF' }}>
      <View className="flex-row items-center gap-2">
        <View className="h-2 w-2 rounded-full bg-sleep" />
        <Txt variant="overline">Sesión de sueño en curso</Txt>
      </View>
      <Text className="mt-2 text-[34px] font-bold text-ink dark:text-ink-dark">{formatDurationShort(elapsed)}</Text>
      <Txt variant="caption">
        Desde las {formatIsoTime(session.startedAt)} del {formatEs(new Date(session.startedAt), "EEEE d 'de' MMM")} · tiempo estimado en
        cama
      </Txt>
      <View className="mt-4 flex-row gap-3">
        <Button
          className="flex-1"
          icon={Sun}
          title="Me desperté"
          onPress={() => {
            haptics.success();
            router.push({ pathname: '/sleep/new', params: { start: session.startedAt, end: new Date().toISOString() } });
          }}
        />
        <IconButton
          icon={X}
          label="Cancelar sesión"
          size={56}
          onPress={() => confirmAction('Cancelar sesión', 'Se descartará la sesión sin guardar ningún registro.', 'Descartar', () => discard())}
        />
      </View>
    </View>
  );
}

export default function SleepScreen() {
  const t = useTheme();
  const today = useToday();
  const logs = useSleepStore((s) => s.logs);
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const goal = settings.sleepGoalMinutes;
  const [range, setRange] = useState<Range>('7');
  const [visible, setVisible] = useState(PAGE);
  const days = Number(range);
  const health = platformHealthProvider();
  const wakeAlarms = useWakeStore((s) => s.alarms);
  const nextAlarm = useMemo(() => {
    const now = new Date();
    return wakeAlarms
      .map((alarm) => ({ alarm, at: nextWakeAt(alarm, now) }))
      .filter((x): x is { alarm: (typeof wakeAlarms)[number]; at: Date } => !!x.at)
      .sort((a, b) => a.at.getTime() - b.at.getTime())[0];
  }, [wakeAlarms]);

  const latest = logs[0] ?? null;
  const series = useMemo(() => sleepSeries(logs, today, days), [logs, today, days]);
  const week = useMemo(() => logsInRange(logs, shiftKey(today, -6), today), [logs, today]);
  const month = useMemo(() => logsInRange(logs, shiftKey(today, -29), today), [logs, today]);
  const inRange = days === 7 ? week : month;
  const summary = useMemo(() => summarizeSleep(inRange, goal), [inRange, goal]);
  const weekAvg = summarizeSleep(week, goal);
  const monthAvg = summarizeSleep(month, goal);
  const vsGoal = compareWithGoal(inRange, goal);

  const updateReminder = async (key: 'bedtimeReminderEnabled' | 'bedtimeReminderTime', value: boolean | string) => {
    await update(key, value as never);
    if (!(await syncBedtimeReminder())) showAlert('Permiso necesario', 'Activa las notificaciones de Rutiva en los ajustes del sistema.');
  };

  // Agrupa el historial por mes para leerlo mejor.
  const history = logs.slice(0, visible);
  const months: { key: string; items: typeof history }[] = [];
  for (const log of history) {
    const key = log.date.slice(0, 7);
    const lastGroup = months[months.length - 1];
    if (lastGroup?.key === key) lastGroup.items.push(log);
    else months.push({ key, items: [log] });
  }

  return (
    <Screen
      subtitle="Descanso"
      title="Sueño"
      right={<IconButton icon={Plus} tone="brand" label="Registrar sueño manualmente" onPress={() => router.push('/sleep/new')} />}
    >
      <SleepTimerCard />

      {!latest ? (
        <EmptyState
          icon={Moon}
          title="Registra tu primera noche"
          description="Usa «Voy a dormir» al acostarte o anota las horas a mano. Verás tus promedios, tu constancia y si cumples tu meta."
          action={<Button title="Registro manual" icon={Plus} variant="secondary" onPress={() => router.push('/sleep/new')} />}
        />
      ) : (
        <>
          {/* Última noche */}
          <Animated.View entering={FadeInDown.springify().damping(18)}>
            <PressableScale scaleTo={0.98} onPress={() => router.push({ pathname: '/sleep/new', params: { id: latest.id } })}>
              <Card className="mt-4 flex-row items-center gap-5">
                <ProgressRing progress={latest.durationMinutes / goal} size={92} stroke={9} color={t.sleep} trackColor={`${t.sleep}2A`}>
                  <Text className="text-[15px] font-bold text-ink dark:text-ink-dark">{Math.round((latest.durationMinutes / goal) * 100)}%</Text>
                </ProgressRing>
                <View className="flex-1">
                  <Txt variant="overline">{latest.date === today ? 'Anoche' : formatEs(latest.date, "EEEE d 'de' MMM")}</Txt>
                  <Text className="mt-1 text-[28px] font-bold text-ink dark:text-ink-dark">{formatDurationShort(latest.durationMinutes)}</Text>
                  <Txt variant="caption">
                    {formatIsoTime(latest.bedtimeAt)} → {formatIsoTime(latest.wakeAt)}
                    {latest.latencyMinutes ? ` · ${latest.latencyMinutes} min hasta dormir` : ''}
                  </Txt>
                  <View className="mt-2 flex-row items-center gap-2">
                    <QualityStars value={latest.quality} />
                    <View className="rounded-full bg-subtle px-2 py-0.5 dark:bg-subtle-dark">
                      <Txt variant="caption" className="text-[11px]">
                        {SOURCE_LABELS[latest.source].label}
                      </Txt>
                    </View>
                  </View>
                </View>
              </Card>
            </PressableScale>
          </Animated.View>

          {/* Promedios */}
          <View className="mt-3 flex-row gap-3">
            <StatTile icon={CalendarDays} color={t.sleep} label="Promedio semanal" value={weekAvg.nights ? formatDurationShort(weekAvg.avgMinutes) : '–'} hint={`${weekAvg.nights} de 7 noches`} />
            <StatTile icon={CalendarDays} color={t.brand} label="Promedio mensual" value={monthAvg.nights ? formatDurationShort(monthAvg.avgMinutes) : '–'} hint={`${monthAvg.nights} de 30 noches`} />
          </View>

          {/* Real vs objetivo */}
          <SectionHeader title="Duración del sueño" />
          <Segmented<Range>
            value={range}
            onChange={setRange}
            options={[
              { value: '7', label: '7 días' },
              { value: '30', label: '30 días' },
            ]}
          />
          <Card className="mt-3 pt-5">
            <SleepChart series={series} goalMinutes={goal} today={today} />
            <View className="mt-3 flex-row items-center gap-4">
              <View className="flex-row items-center gap-1.5">
                <View className="h-2.5 w-2.5 rounded-sm bg-sleep" />
                <Txt variant="caption">Meta cumplida</Txt>
              </View>
              <View className="flex-row items-center gap-1.5">
                <View className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: `${t.sleep}88` }} />
                <Txt variant="caption">Por debajo</Txt>
              </View>
              <View className="flex-row items-center gap-1.5">
                <View className="h-0 w-3" style={{ borderTopWidth: 1, borderStyle: 'dashed', borderColor: t.muted }} />
                <Txt variant="caption">Objetivo</Txt>
              </View>
            </View>
          </Card>

          <View className="mt-3 flex-row gap-3">
            <StatTile
              icon={Scale}
              color={vsGoal.diffMinutes >= 0 ? t.success : t.danger}
              label="Media vs meta"
              value={summary.nights ? signed(vsGoal.diffMinutes) : '–'}
              hint={`meta ${formatDurationShort(goal)}`}
            />
            <StatTile
              icon={TrendingDown}
              color={t.warning}
              label="Deuda de sueño"
              value={summary.nights ? formatDurationShort(vsGoal.debtMinutes) : '–'}
              hint={`en ${days} días`}
            />
          </View>
          <View className="mt-3 flex-row gap-3">
            <StatTile
              icon={Target}
              color={t.success}
              label="Meta cumplida"
              value={summary.nights ? `${Math.round(summary.goalHitRate * 100)}%` : '–'}
              hint={`${summary.nights} ${summary.nights === 1 ? 'noche' : 'noches'}`}
            />
            <StatTile
              icon={BedDouble}
              color={t.brand}
              label="Te acuestas"
              value={summary.avgBedtimeOffset !== null ? minutesToTime(summary.avgBedtimeOffset) : '–'}
              hint={summary.avgWakeMinutes !== null ? `te levantas ${minutesToTime(summary.avgWakeMinutes)}` : 'hora media'}
            />
          </View>
        </>
      )}

      {/* Ajustes de sueño */}
      <SectionHeader title="Meta y recordatorio" />
      <Card>
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <Target size={18} color={t.sleep} />
            <Txt variant="label">Meta diaria</Txt>
          </View>
          <Stepper value={goal} min={300} max={720} step={15} format={formatDurationShort} onChange={(v) => update('sleepGoalMinutes', v)} />
        </View>
      </Card>
      <Card className="mt-3 py-1">
        <ListRow
          icon={Bell}
          iconColor={t.sleep}
          title="Recordatorio para dormir"
          subtitle={
            !notificationsSupported
              ? 'Disponible en Android e iOS'
              : settings.bedtimeReminderEnabled
                ? `Todas las noches a las ${settings.bedtimeReminderTime}`
                : 'Desactivado'
          }
          last
          right={<Toggle value={settings.bedtimeReminderEnabled} onValueChange={(v) => updateReminder('bedtimeReminderEnabled', v)} />}
        />
      </Card>
      {settings.bedtimeReminderEnabled ? (
        <View className="mt-3">
          <TimeField label="Hora del aviso" icon={AlarmClock} value={settings.bedtimeReminderTime} onChange={(v) => updateReminder('bedtimeReminderTime', v)} />
        </View>
      ) : null}

      <Card className="mt-3 py-1">
        <ListRow
          icon={AlarmClock}
          iconColor={t.warning}
          title="Despertador"
          subtitle={
            nextAlarm
              ? `Próxima: ${nextAlarm.alarm.label} a las ${nextAlarm.alarm.time}, ${describeUntil(nextAlarm.at, new Date())}`
              : 'Configura la alarma para despertar'
          }
          last
          onPress={() => router.push('/alarms')}
        />
      </Card>

      {health ? (
        <Card className="mt-3 flex-row items-center gap-3">
          <HeartPulse size={18} color={t.muted} />
          <View className="flex-1">
            <Txt variant="label">Importar de {health.name}</Txt>
            <Txt variant="caption" className="mt-0.5">
              Próximamente. Requerirá tu permiso explícito y una versión instalable de la app (no funciona en Expo Go).
            </Txt>
          </View>
        </Card>
      ) : null}

      {/* Historial completo */}
      {logs.length ? (
        <>
          <SectionHeader title={`Historial · ${logs.length} ${logs.length === 1 ? 'noche' : 'noches'}`} />
          {months.map((m) => (
            <View key={m.key}>
              <Txt variant="overline" className="mb-2 mt-2">
                {formatEs(`${m.key}-01`, 'MMMM yyyy')}
              </Txt>
              {m.items.map((log) => {
                const diff = log.durationMinutes - goal;
                return (
                  <PressableScale key={log.id} scaleTo={0.98} onPress={() => router.push({ pathname: '/sleep/new', params: { id: log.id } })}>
                    <Card className="mb-2.5 flex-row items-center gap-3.5 py-3.5">
                      <View className="h-11 w-11 items-center justify-center rounded-2xl bg-sleep/15">
                        <Text className="text-[15px] font-bold text-sleep">{formatEs(log.date, 'd')}</Text>
                      </View>
                      <View className="flex-1">
                        <Txt variant="label">{formatEs(log.date, 'EEEE')}</Txt>
                        <Txt variant="caption" className="mt-0.5">
                          {formatIsoTime(log.bedtimeAt)} → {formatIsoTime(log.wakeAt)} · {SOURCE_LABELS[log.source].label}
                        </Txt>
                        <View className="mt-1">
                          <QualityStars value={log.quality} size={10} />
                        </View>
                      </View>
                      <View className="items-end">
                        <Txt variant="heading">{formatDurationShort(log.durationMinutes)}</Txt>
                        <Text className={`mt-0.5 text-[11px] font-semibold ${diff >= 0 ? 'text-success' : 'text-danger'}`}>{signed(diff)}</Text>
                      </View>
                    </Card>
                  </PressableScale>
                );
              })}
            </View>
          ))}
          {visible < logs.length ? (
            <Button variant="secondary" title={`Ver más (${logs.length - visible})`} onPress={() => setVisible((v) => v + PAGE)} />
          ) : null}
          <Txt variant="caption" className="mt-3 text-center">
            Toca una noche para corregirla. {QUALITY_LABELS[5]} = 5 estrellas.
          </Txt>
        </>
      ) : null}
    </Screen>
  );
}
