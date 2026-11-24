import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { CircleStop, Pause, Play, Plus, RotateCcw, Timer, Trash } from 'lucide-react-native';
import { formatEs, todayKey } from '@/domain/dates';
import { describeProgress, describeRemaining, formatNumber, getValue, progressRatio } from '@/domain/habits';
import type { Habit } from '@/domain/types';
import { useHabitStore } from '@/features/habits/store/useHabitStore';
import { useTimerStore } from '@/features/habits/store/timer';
import { elapsedMs, formatClock } from '@/domain/timer';
import { toast } from '@/ui/toast';
import { useLogIndex } from '@/features/habits/hooks/useLogIndex';
import { haptics } from '@/lib/haptics';
import { confirmAction, showError } from '@/lib/dialogs';
import { ModalScreen } from '@/ui/layout';
import { Button, Card, IconBadge, Txt } from '@/ui/primitives';
import { ProgressRing } from '@/ui/progress';
import { FieldLabel, NumberField } from '@/ui/form';
import { habitIcon } from '@/features/habits/components/habitIcons';

function quickSteps(habit: Habit): number[] {
  if (habit.trackingType === 'duration') return [5, 15, 30];
  if (habit.unit === 'L') return [0.25, 0.5, 1];
  if (habit.unit === 'ml') return [150, 250, 500];
  if (habit.target <= 5) return [0.5, 1, 2];
  if (habit.target <= 50) return [1, 5, 10];
  return [10, 50, 100];
}

function Stopwatch({ habit, date }: { habit: Habit; date: string }) {
  const active = useTimerStore((s) => s.session);
  const timer = useTimerStore.getState();
  const habits = useHabitStore((s) => s.habits);
  const [now, setNow] = useState(() => Date.now());
  const mine = active?.habitId === habit.id ? active : null;
  const running = mine?.status === 'running';

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  if (active && !mine) {
    const other = habits.find((h) => h.id === active.habitId);
    return (
      <Card>
        <Txt variant="label">Hay otro cronómetro en marcha</Txt>
        <Txt variant="caption" className="mt-1">
          {other ? `«${other.name}»` : 'Otro hábito'} está cronometrándose. Finalízalo antes de empezar uno nuevo.
        </Txt>
        {other ? (
          <Button
            className="mt-3"
            size="sm"
            variant="secondary"
            icon={Timer}
            title="Ir al cronómetro"
            onPress={() => router.replace({ pathname: '/habit/log/[id]', params: { id: other.id, date: active.date ?? todayKey() } })}
          />
        ) : (
          <Button className="mt-3" size="sm" variant="secondary" title="Descartar cronómetro" onPress={() => timer.discard()} />
        )}
      </Card>
    );
  }

  const ms = mine ? elapsedMs(mine, now) : 0;

  return (
    <Card className="items-center py-6">
      <Text className="font-bold text-ink dark:text-ink-dark" style={{ fontSize: 52, fontVariant: ['tabular-nums'] }}>
        {formatClock(ms)}
      </Text>
      <Txt variant="caption" className="mt-1">
        {mine ? (running ? 'Cronometrando…' : 'En pausa') : 'Cronómetro'}
        {mine?.date && mine.date !== todayKey() ? ` · se sumará al ${formatEs(mine.date, "d 'de' MMM")}` : ''}
      </Txt>
      <View className="mt-5 w-full flex-row gap-3">
        {!mine ? (
          <Button
            className="flex-1"
            icon={Play}
            title="Iniciar"
            onPress={() => {
              haptics.success();
              setNow(Date.now());
              timer.start(habit.id, date).catch((e) => showError('No se pudo iniciar', e));
            }}
          />
        ) : (
          <>
            <Button
              className="flex-1"
              variant="secondary"
              icon={running ? Pause : Play}
              title={running ? 'Pausar' : 'Reanudar'}
              onPress={() => {
                haptics.light();
                setNow(Date.now());
                if (running) timer.pause();
                else timer.resume();
              }}
            />
            <Button
              className="flex-1"
              icon={CircleStop}
              title="Finalizar"
              onPress={async () => {
                try {
                  const added = await timer.finish();
                  haptics.success();
                  if (added === 0) toast('Menos de un minuto: no se sumó tiempo', { tone: 'info' });
                  else toast(`+${added} min registrados`, { undo: () => useHabitStore.getState().addProgress(habit.id, date, -added) });
                } catch (e) {
                  showError('No se pudo guardar', e);
                }
              }}
            />
          </>
        )}
      </View>
      {mine ? (
        <Button
          className="mt-2"
          size="sm"
          variant="ghost"
          icon={Trash}
          title="Descartar sin guardar"
          onPress={() => confirmAction('Descartar cronómetro', 'El tiempo medido no se guardará.', 'Descartar', () => timer.discard())}
        />
      ) : null}
    </Card>
  );
}

export default function LogProgressScreen() {
  const { id, date: dateParam } = useLocalSearchParams<{ id: string; date?: string }>();
  const date = dateParam ?? todayKey();
  const habit = useHabitStore((s) => s.habits.find((h) => h.id === id));
  const { addProgress, setValue } = useHabitStore.getState();
  const logs = useLogIndex();
  const [custom, setCustom] = useState<number | null>(null);
  const [customKey, setCustomKey] = useState(0);

  if (!habit) return <Redirect href="/" />;

  const value = getValue(logs, habit.id, date);
  const unit = habit.trackingType === 'duration' ? 'min' : (habit.unit ?? '');
  const Icon = habitIcon(habit.icon);
  const remaining = describeRemaining(habit, value);

  const run = (fn: () => Promise<void>) => fn().catch((e) => showError('No se pudo guardar', e));
  const add = (delta: number) => {
    const completes = value < habit.target && value + delta >= habit.target - 1e-6;
    if (completes) haptics.success();
    else haptics.light();
    run(async () => {
      await addProgress(habit.id, date, delta);
      toast(completes ? '¡Meta cumplida!' : `+${formatNumber(delta)} ${unit} registrados`, {
        undo: () => addProgress(habit.id, date, -delta),
      });
    });
  };

  return (
    <ModalScreen title={habit.trackingType === 'duration' ? 'Registrar tiempo' : 'Registrar cantidad'}>
      <View className="flex-row items-center gap-3">
        <IconBadge icon={Icon} color={habit.color} size={44} />
        <View className="flex-1">
          <Txt variant="heading">{habit.name}</Txt>
          <Txt variant="caption">{date === todayKey() ? 'Hoy' : formatEs(date, "EEEE d 'de' MMMM")}</Txt>
        </View>
      </View>

      <View className="mt-6 items-center">
        <ProgressRing progress={progressRatio(habit, value)} size={168} stroke={14} color={habit.color}>
          <Text className="text-[30px] font-bold text-ink dark:text-ink-dark">{formatNumber(value)}</Text>
          <Txt variant="caption">
            de {formatNumber(habit.target)} {unit}
          </Txt>
        </ProgressRing>
        <Txt variant="label" className="mt-3">
          {remaining ?? '¡Meta cumplida!'}
        </Txt>
      </View>

      {habit.trackingType === 'duration' ? (
        <>
          <FieldLabel>Cronómetro</FieldLabel>
          <Stopwatch habit={habit} date={date} />
        </>
      ) : null}

      <FieldLabel>{habit.trackingType === 'duration' ? 'Registro manual' : 'Añadir rápido'}</FieldLabel>
      <View className="flex-row gap-2">
        {quickSteps(habit).map((step) => (
          <Button key={step} className="flex-1" variant="secondary" icon={Plus} title={`${formatNumber(step)} ${unit}`} onPress={() => add(step)} />
        ))}
      </View>

      <FieldLabel>Cantidad personalizada</FieldLabel>
      <NumberField key={customKey} value={null} onChange={setCustom} placeholder={habit.trackingType === 'duration' ? 'Minutos' : `Cantidad en ${unit}`} suffix={unit} />
      <View className="mt-3 flex-row gap-2">
        <Button
          className="flex-1"
          icon={Plus}
          title="Añadir"
          disabled={!custom}
          onPress={() => {
            if (!custom) return;
            add(custom);
            setCustomKey((k) => k + 1);
            setCustom(null);
          }}
        />
        <Button
          className="flex-1"
          variant="secondary"
          title="Fijar total"
          disabled={!custom}
          onPress={() => {
            if (!custom) return;
            haptics.light();
            const previous = value;
            const total = custom;
            run(async () => {
              await setValue(habit.id, date, total);
              toast(`Total fijado en ${formatNumber(total)} ${unit}`, { undo: () => setValue(habit.id, date, previous) });
            });
            setCustomKey((k) => k + 1);
            setCustom(null);
          }}
        />
      </View>

      {value > 0 ? (
        <Button
          className="mt-6"
          variant="ghost"
          icon={RotateCcw}
          title="Reiniciar este día"
          onPress={() =>
            confirmAction('Reiniciar progreso', `Se borrará el progreso registrado (${describeProgress(habit, value)}).`, 'Reiniciar', () =>
              run(async () => {
                await setValue(habit.id, date, 0);
                toast('Progreso reiniciado', { undo: () => setValue(habit.id, date, value) });
              }),
            )
          }
        />
      ) : null}
    </ModalScreen>
  );
}
