import { useState } from 'react';
import { Keyboard, ScrollView, Text, View } from 'react-native';
import { KeyboardSafe } from '@/ui/layout';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInRight, FadeOutLeft } from 'react-native-reanimated';
import { ArrowRight, Check, Droplets, Moon, Sparkles } from 'lucide-react-native';
import { CATEGORIES } from '@/domain/categories';
import { ALL_DAYS, describeTarget, formatMinutes, formatNumber } from '@/domain/habits';
import { formatDurationShort, todayKey } from '@/domain/dates';
import { formatWater } from '@/domain/water';
import type { HabitInput } from '@/domain/types';
import { useHabitStore } from '@/features/habits/store/useHabitStore';
import { useSettingsStore } from '@/features/settings/store/useSettingsStore';
import { habitIcon } from '@/features/habits/components/habitIcons';
import { useTheme, WATER_COLOR } from '@/theme/colors';
import { haptics } from '@/lib/haptics';
import { showError } from '@/lib/dialogs';
import { Button, Card, IconBadge, PressableScale, Txt, cx } from '@/ui/primitives';
import { FieldLabel, Stepper, TextField } from '@/ui/form';
import { toast } from '@/ui/toast';

type Starter = Pick<HabitInput, 'name' | 'category' | 'trackingType' | 'target' | 'unit'> & { icon?: string; step: number };

const STARTERS: Starter[] = [
  { name: 'Beber agua', category: 'hydration', trackingType: 'quantity', target: 2.5, unit: 'L', step: 0.25 },
  { name: 'Entrenamiento', category: 'exercise', trackingType: 'duration', target: 45, unit: null, step: 5 },
  { name: 'Leer', category: 'study', icon: 'book', trackingType: 'quantity', target: 10, unit: 'páginas', step: 5 },
  { name: 'Estudiar', category: 'study', icon: 'code', trackingType: 'duration', target: 60, unit: null, step: 15 },
  { name: 'Meditar', category: 'wellbeing', trackingType: 'duration', target: 10, unit: null, step: 5 },
  { name: 'Caminar', category: 'exercise', icon: 'walk', trackingType: 'count', target: 1, unit: null, step: 1 },
  { name: 'Tomar vitaminas', category: 'health', icon: 'pill', trackingType: 'check', target: 1, unit: null, step: 1 },
  { name: 'Comer fruta', category: 'food', icon: 'fruit', trackingType: 'count', target: 2, unit: 'piezas', step: 1 },
];

function toInput(s: Starter): HabitInput {
  const cat = CATEGORIES[s.category];
  return {
    name: s.name,
    description: null,
    category: s.category,
    icon: s.icon ?? cat.icon,
    color: cat.color,
    trackingType: s.trackingType,
    target: s.target,
    unit: s.unit,
    frequency: 'daily',
    daysOfWeek: ALL_DAYS,
    intervalDays: 1,
    startDate: todayKey(),
    endDate: null,
    suggestedTime: null,
    reminderTimes: [],
  };
}

const STEPS = 3;

export default function WelcomeScreen() {
  const t = useTheme();
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const createHabit = useHabitStore((s) => s.createHabit);
  const [step, setStep] = useState(0);
  const [name, setName] = useState(settings.userName);
  const [starters, setStarters] = useState(STARTERS);
  const [selected, setSelected] = useState<Set<number>>(new Set([0, 2]));
  const [waterGoal, setWaterGoal] = useState(settings.waterGoalMl);
  const [sleepGoal, setSleepGoal] = useState(settings.sleepGoalMinutes);
  const [saving, setSaving] = useState(false);

  // Al cambiar de paso se cierra el teclado para que no tape los botones.
  const goTo = (next: number) => {
    Keyboard.dismiss();
    setStep(Math.max(0, Math.min(STEPS - 1, next)));
  };

  const toggle = (i: number) => {
    haptics.selection();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const setTarget = (i: number, target: number) => setStarters((list) => list.map((s, j) => (j === i ? { ...s, target } : s)));

  const finish = async (skip = false) => {
    setSaving(true);
    try {
      await update('userName', name.trim());
      if (!skip) {
        await update('waterGoalMl', waterGoal);
        await update('sleepGoalMinutes', sleepGoal);
        for (const i of [...selected].sort()) {
          const s = starters[i];
          // La meta del hábito de agua sigue a la meta de hidratación.
          await createHabit(toInput(s.category === 'hydration' && s.unit === 'L' ? { ...s, target: waterGoal / 1000 } : s));
        }
      }
      await update('onboarded', true);
      haptics.success();
      router.replace('/');
      if (!skip && selected.size) toast(`¡Listo! ${selected.size} ${selected.size === 1 ? 'hábito creado' : 'hábitos creados'}`);
    } catch (e) {
      showError('No se pudo completar la configuración', e);
      setSaving(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-canvas dark:bg-canvas-dark">
      <KeyboardSafe>
      {/* Progreso */}
      <View className="flex-row items-center justify-between px-5 pt-2">
        <View className="flex-row gap-1.5">
          {Array.from({ length: STEPS }, (_, i) => (
            <View key={i} className={cx('h-1.5 rounded-full', i === step ? 'w-6 bg-brand-500' : 'w-1.5 bg-line dark:bg-line-dark')} />
          ))}
        </View>
        <PressableScale onPress={() => finish(true)} disabled={saving} hitSlop={10}>
          <Text className="text-[14px] font-semibold text-muted dark:text-muted-dark">Omitir</Text>
        </PressableScale>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-6 pt-6"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Animated.View key={step} entering={FadeInRight.springify().damping(20)} exiting={FadeOutLeft.duration(150)}>
          {step === 0 ? (
            <>
              <View className="mb-6 h-16 w-16 items-center justify-center rounded-3xl bg-brand-500">
                <Sparkles size={30} color="#FFFFFF" />
              </View>
              <Txt variant="display">Bienvenido a Rutiva</Txt>
              <Txt variant="body" className="mt-3 text-muted dark:text-muted-dark">
                Organiza tus hábitos, registra tu progreso en segundos y cuida tu descanso. Todo se guarda solo en tu móvil.
              </Txt>
              <FieldLabel hint="Opcional">¿Cómo te llamas?</FieldLabel>
              <TextField value={name} onChangeText={setName} placeholder="Tu nombre" maxLength={24} returnKeyType="next" onSubmitEditing={() => goTo(1)} />
            </>
          ) : null}

          {step === 1 ? (
            <>
              <Txt variant="title">Elige tus primeros hábitos</Txt>
              <Txt variant="caption" className="mt-2">
                Empieza con pocos: es más fácil mantenerlos. Ajusta la meta con − y +; luego podrás cambiar todo.
              </Txt>
              <View className="mt-5 gap-3">
                {starters.map((s, i) => {
                  const isSel = selected.has(i);
                  const cat = CATEGORIES[s.category];
                  return (
                    <PressableScale
                      key={s.name}
                      scaleTo={0.98}
                      onPress={() => toggle(i)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isSel }}
                      className={cx('rounded-3xl border p-3.5', isSel ? '' : 'border-line bg-card dark:border-line-dark dark:bg-card-dark')}
                      style={isSel ? { borderColor: cat.color, backgroundColor: `${cat.color}14` } : undefined}
                    >
                      <View className="flex-row items-center gap-3">
                        <IconBadge icon={habitIcon(s.icon ?? cat.icon)} color={cat.color} size={42} />
                        <View className="flex-1">
                          <Txt variant="heading">{s.name}</Txt>
                          <Txt variant="caption">{s.trackingType === 'check' ? 'Marcar cada día' : `${describeTarget(s)} al día`}</Txt>
                        </View>
                        <View
                          className="h-7 w-7 items-center justify-center rounded-full border-2"
                          style={{ borderColor: isSel ? cat.color : t.line, backgroundColor: isSel ? cat.color : 'transparent' }}
                        >
                          {isSel ? <Check size={16} color="#FFFFFF" strokeWidth={3} /> : null}
                        </View>
                      </View>
                      {isSel && s.trackingType !== 'check' ? (
                        <View className="mt-3 flex-row items-center justify-between border-t border-line pt-3 dark:border-line-dark">
                          <Txt variant="label">Meta diaria</Txt>
                          <Stepper
                            value={s.target}
                            min={s.step}
                            max={s.trackingType === 'duration' ? 300 : s.step * 40}
                            step={s.step}
                            onChange={(v) => setTarget(i, Math.round(v * 100) / 100)}
                            format={(v) => (s.trackingType === 'duration' ? formatMinutes(v) : `${formatNumber(v)}${s.unit ? ` ${s.unit}` : ''}`)}
                          />
                        </View>
                      ) : null}
                    </PressableScale>
                  );
                })}
              </View>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <Txt variant="title">Tus metas diarias</Txt>
              <Txt variant="caption" className="mt-2">
                Las usaremos para mostrar tu progreso de agua y sueño.
              </Txt>
              <Card className="mt-5">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-3">
                    <Droplets size={20} color={WATER_COLOR} />
                    <Txt variant="label">Agua</Txt>
                  </View>
                  <Stepper value={waterGoal} min={500} max={6000} step={250} onChange={setWaterGoal} format={(v) => formatWater(v, 'L')} />
                </View>
              </Card>
              <Card className="mt-3">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-3">
                    <Moon size={20} color={t.sleep} />
                    <Txt variant="label">Sueño</Txt>
                  </View>
                  <Stepper value={sleepGoal} min={300} max={720} step={15} onChange={setSleepGoal} format={formatDurationShort} />
                </View>
              </Card>
              <Txt variant="caption" className="mt-5">
                {selected.size
                  ? `Se crearán ${selected.size} ${selected.size === 1 ? 'hábito' : 'hábitos'}: ${[...selected].map((i) => starters[i].name).join(', ')}.`
                  : 'No has elegido hábitos; podrás crearlos desde la pestaña Hábitos.'}
              </Txt>
            </>
          ) : null}
        </Animated.View>
      </ScrollView>

      {/* Acciones al alcance del pulgar */}
      <View className="flex-row gap-3 px-5 pb-2 pt-3">
        {step > 0 ? <Button className="flex-1" variant="secondary" title="Atrás" onPress={() => goTo(step - 1)} /> : null}
        <Button
          className="flex-[2]"
          icon={step === STEPS - 1 ? Check : ArrowRight}
          title={step === STEPS - 1 ? 'Empezar' : 'Continuar'}
          disabled={saving}
          onPress={() => (step === STEPS - 1 ? finish() : goTo(step + 1))}
        />
      </View>
      </KeyboardSafe>
    </SafeAreaView>
  );
}
