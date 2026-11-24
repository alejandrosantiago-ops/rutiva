import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Droplets, Moon, Sun } from 'lucide-react-native';
import { formatEs } from '@/domain/dates';
import { dayProgress } from '@/domain/habits';
import { useHabitStore } from '@/features/habits/store/useHabitStore';
import { useLogIndex } from '@/features/habits/hooks/useLogIndex';
import { useSettingsStore } from '@/features/settings/store/useSettingsStore';
import { useSleepSessionStore } from '@/features/sleep/store/sleepSession';
import { useSleepStore } from '@/features/sleep/store/useSleepStore';
import { useToday } from '@/hooks/useToday';
import { useTheme, WATER_COLOR } from '@/theme/colors';
import { goBack } from '@/lib/navigation';
import { DayHabitList } from '@/features/habits/components/DayHabitList';
import { ActionBar, Button, Card, Txt } from '@/ui/primitives';

/**
 * Pantalla de "buenos días": se abre al tocar la alarma. Muestra de un
 * vistazo los hábitos pendientes de hoy y accesos rápidos a sueño y agua.
 */
export default function MorningScreen() {
  const t = useTheme();
  const today = useToday();
  const habits = useHabitStore((s) => s.habits);
  const logs = useLogIndex();
  const name = useSettingsStore((s) => s.settings.userName.trim());
  const session = useSleepSessionStore((s) => s.session);
  const sleptLogged = useSleepStore((s) => s.logs.some((l) => l.date === today));
  const p = dayProgress(habits, logs, today);
  const pending = p.scheduled - p.completed;

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-canvas dark:bg-canvas-dark">
      <ScrollView contentContainerClassName="px-5 pb-6 pt-4" showsVerticalScrollIndicator={false}>
        <View className="items-center pt-4">
          <View className="h-20 w-20 items-center justify-center rounded-full bg-warning/15">
            <Sun size={40} color={t.warning} />
          </View>
          <Txt variant="display" className="mt-4 text-center">
            Buenos días{name ? `, ${name}` : ''}
          </Txt>
          <Txt variant="caption" className="mt-1 text-center">
            {formatEs(today, "EEEE, d 'de' MMMM")}
          </Txt>
          <Text className="mt-4 text-center text-[16px] text-ink dark:text-ink-dark">
            {p.scheduled === 0
              ? 'Hoy no tienes hábitos programados.'
              : pending === 0
                ? '¡Ya completaste todos tus hábitos de hoy!'
                : `Tienes ${pending} ${pending === 1 ? 'hábito pendiente' : 'hábitos pendientes'} para hoy.`}
          </Text>
        </View>

        {session || !sleptLogged ? (
          <Card className="mt-6 flex-row items-center gap-3">
            <Moon size={20} color={t.sleep} />
            <Txt variant="label" className="flex-1">
              {session ? 'Tienes una sesión de sueño en curso.' : '¿Cómo dormiste?'}
            </Txt>
            <Button
              size="sm"
              title={session ? 'Me desperté' : 'Registrar'}
              onPress={() =>
                session
                  ? router.push({ pathname: '/sleep/new', params: { start: session.startedAt, end: new Date().toISOString() } })
                  : router.push('/sleep/new')
              }
            />
          </Card>
        ) : null}

        <Card className="mt-3 flex-row items-center gap-3">
          <Droplets size={20} color={WATER_COLOR} />
          <Txt variant="label" className="flex-1">
            Empieza el día con un vaso de agua
          </Txt>
          <Button size="sm" variant="secondary" title="Agua" onPress={() => router.push('/water')} />
        </Card>

        <Txt variant="heading" className="mb-3 mt-7">
          Hábitos de hoy
        </Txt>
        <DayHabitList date={today} today={today} />
      </ScrollView>

      <View className="px-4 pb-2 pt-2">
        <ActionBar
          left={<Button variant="secondary" title="Cerrar" onPress={() => goBack('/')} />}
          right={<Button title="Ir a Inicio" onPress={() => router.replace('/')} />}
        />
      </View>
    </SafeAreaView>
  );
}
