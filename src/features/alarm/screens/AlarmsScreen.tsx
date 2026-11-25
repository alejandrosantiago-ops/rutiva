import { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { AlarmClock, BellRing, ChevronLeft, Info, Plus, Smartphone } from 'lucide-react-native';
import { describeUntil, describeWakeDays, nextWakeAt } from '@/domain/wake';
import { useWakeStore } from '@/features/alarm/store/useWakeStore';
import { useTheme } from '@/theme/colors';
import { goBack } from '@/lib/navigation';
import { showError } from '@/lib/dialogs';
import { toast } from '@/ui/toast';
import { Card, EmptyState, IconButton, PressableScale, Txt, cx } from '@/ui/primitives';
import { Toggle } from '@/ui/form';
import { Fab } from '@/ui/fab';
import { systemAlarms } from '../../../../modules/rutiva-alarm';

export default function AlarmsScreen() {
  const t = useTheme();
  const alarms = useWakeStore((s) => s.alarms);
  const setEnabled = useWakeStore((s) => s.setEnabled);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const hasSystem = systemAlarms.supported();

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-canvas dark:bg-canvas-dark">
      <View className="flex-row items-center gap-3 px-5 py-2">
        <IconButton icon={ChevronLeft} label="Volver" onPress={() => goBack()} size={40} />
        <Txt variant="title">Despertador</Txt>
      </View>

      <Animated.ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {alarms.length === 0 ? (
          <EmptyState
            icon={AlarmClock}
            title="Sin alarmas"
            description="Crea una alarma para despertar. Al sonar, te dará los buenos días con tus hábitos pendientes."
          />
        ) : (
          alarms.map((a, i) => {
            const next = nextWakeAt(a, now);
            return (
              <Animated.View key={a.id} entering={FadeInDown.delay(i * 40)}>
                <PressableScale
                  scaleTo={0.98}
                  onPress={() => router.push({ pathname: '/alarm/[id]', params: { id: a.id } })}
                  accessibilityLabel={`Editar alarma ${a.label} de las ${a.time}`}
                  className={cx(
                    'mt-3 flex-row items-center rounded-3xl border border-line bg-card p-4 dark:border-line-dark dark:bg-card-dark',
                    !a.enabled && 'opacity-60',
                  )}
                >
                  <View className="flex-1">
                    <Text className="text-[40px] font-bold tracking-tight text-ink dark:text-ink-dark">{a.time}</Text>
                    <Txt variant="label">{a.label}</Txt>
                    <Txt variant="caption" className="mt-0.5">
                      {describeWakeDays(a.daysOfWeek)}
                      {a.enabled && next ? ` · suena ${describeUntil(next, now)}` : ''}
                    </Txt>
                    <View className="mt-2 flex-row">
                      <View className="flex-row items-center gap-1 rounded-full bg-subtle px-2.5 py-1 dark:bg-subtle-dark">
                        {a.mode === 'system' ? <Smartphone size={12} color={t.muted} /> : <BellRing size={12} color={t.muted} />}
                        <Txt variant="caption" className="text-[11px]">
                          {a.mode === 'system' ? 'Reloj del sistema' : 'Aviso de Rutiva'}
                        </Txt>
                      </View>
                    </View>
                  </View>
                  <Toggle
                    value={a.enabled}
                    onValueChange={(v) =>
                      setEnabled(a.id, v)
                        .then(() => {
                          if (a.mode === 'system' && !v) toast('Desactívala también en la app Reloj', { tone: 'info' });
                          else toast(v ? 'Alarma activada' : 'Alarma desactivada');
                        })
                        .catch((e) => showError('No se pudo guardar', e))
                    }
                  />
                </PressableScale>
              </Animated.View>
            );
          })
        )}

        <Card className="mt-6 flex-row gap-3">
          <Info size={18} color={t.muted} />
          <Txt variant="caption" className="flex-1 leading-5">
            {Platform.OS === 'android'
              ? hasSystem
                ? '«Reloj del sistema» crea una alarma real en tu app Reloj: suena hasta que la apagas, a pantalla completa y aunque Rutiva esté cerrada. «Aviso de Rutiva» es una notificación con sonido de alarma y botón de posponer.'
                : 'Estás usando Expo Go: solo está disponible «Aviso de Rutiva» (notificación exacta con sonido de alarma). La alarma real del Reloj se activa al instalar la app.'
              : Platform.OS === 'ios'
                ? 'En iOS las apps no pueden crear alarmas del sistema (salvo con AlarmKit en iOS 26+). Rutiva usa un aviso con sonido y prioridad alta: respeta el volumen y el modo silencio del iPhone.'
                : 'En la versión web las alarmas no pueden sonar. Usa Rutiva en tu teléfono para que suenen.'}
          </Txt>
        </Card>
      </Animated.ScrollView>

      <Fab icon={Plus} label="Nueva alarma" onPress={() => router.push({ pathname: '/alarm/[id]', params: { id: 'new' } })} />
    </SafeAreaView>
  );
}
