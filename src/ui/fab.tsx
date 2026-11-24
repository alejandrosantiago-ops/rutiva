import { View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import type { LucideIcon } from 'lucide-react-native';
import { PressableScale } from './primitives';

/**
 * Botón flotante en la esquina inferior derecha: la acción principal de la
 * pantalla queda al alcance del pulgar al usar el móvil con una mano.
 */
export function Fab({ icon: Icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  return (
    <View pointerEvents="box-none" className="absolute bottom-5 right-5">
      <Animated.View entering={ZoomIn.springify().damping(14)}>
        <PressableScale
          haptic
          scaleTo={0.9}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={label}
          className="h-16 w-16 items-center justify-center rounded-full bg-brand-500 shadow-lg dark:bg-brand-400"
          style={{ shadowColor: '#5B5BD6', shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8 }}
        >
          <Icon size={28} color="#FFFFFF" strokeWidth={2.4} />
        </PressableScale>
      </Animated.View>
    </View>
  );
}
