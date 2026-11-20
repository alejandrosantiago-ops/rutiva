import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { CalendarDays, ChartColumn, House, ListChecks, Moon, type LucideIcon } from 'lucide-react-native';
import { useTheme } from '@/theme/colors';
import { haptics } from '@/lib/haptics';

function TabIcon({ icon: Icon, color, focused }: { icon: LucideIcon; color: string; focused: boolean }) {
  const t = useTheme();
  const scale = useSharedValue(focused ? 1 : 0.92);
  useEffect(() => {
    scale.set(withSpring(focused ? 1 : 0.92, { damping: 14, stiffness: 260 }));
  }, [focused, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={style}>
      <View
        className="h-8 w-14 items-center justify-center rounded-full"
        style={{ backgroundColor: focused ? t.brandSoft : 'transparent' }}
      >
        <Icon size={21} color={color} strokeWidth={focused ? 2.4 : 2} />
      </View>
    </Animated.View>
  );
}

const TABS: { name: string; title: string; icon: LucideIcon }[] = [
  { name: 'index', title: 'Inicio', icon: House },
  { name: 'habits', title: 'Hábitos', icon: ListChecks },
  { name: 'calendar', title: 'Calendario', icon: CalendarDays },
  { name: 'sleep', title: 'Sueño', icon: Moon },
  { name: 'stats', title: 'Estadísticas', icon: ChartColumn },
];

export default function TabsLayout() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, Platform.OS === 'android' ? 10 : 8);

  return (
    <Tabs
      screenListeners={{ tabPress: () => haptics.selection() }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.brand,
        tabBarInactiveTintColor: t.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
        tabBarStyle: {
          backgroundColor: t.card,
          borderTopColor: t.line,
          height: 62 + bottom,
          paddingTop: 8,
          paddingBottom: bottom,
        },
      }}
    >
      {TABS.map(({ name, title, icon }) => (
        <Tabs.Screen
          key={name}
          name={name}
          options={{
            title,
            tabBarIcon: ({ color, focused }) => <TabIcon icon={icon} color={color as string} focused={focused} />,
          }}
        />
      ))}
    </Tabs>
  );
}
