import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { create } from 'zustand';
import { CircleAlert, CircleCheck, Undo2 } from 'lucide-react-native';
import { useTheme } from '@/theme/colors';
import { haptics } from '@/lib/haptics';
import { PressableScale } from './primitives';

/*
 * Avisos breves en la parte inferior (zona del pulgar). Sirven como feedback
 * al guardar y para deshacer acciones accidentales durante unos segundos.
 */

export interface ToastOptions {
  message: string;
  tone?: 'success' | 'error' | 'info';
  /** Si se indica, el aviso muestra "Deshacer". */
  undo?: () => void | Promise<void>;
  durationMs?: number;
}

interface ToastState {
  current: (ToastOptions & { id: number }) | null;
  show: (options: ToastOptions) => void;
  hide: (id?: number) => void;
}

let seq = 0;

export const useToastStore = create<ToastState>((set, get) => ({
  current: null,
  show: (options) => set({ current: { ...options, id: ++seq } }),
  hide: (id) => {
    if (id === undefined || get().current?.id === id) set({ current: null });
  },
}));

/** Atajo: `toast('Guardado')` o `toast('Eliminado', { undo })`. */
export function toast(message: string, options: Omit<ToastOptions, 'message'> = {}) {
  useToastStore.getState().show({ message, ...options });
}

export function ToastHost() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const current = useToastStore((s) => s.current);
  const hide = useToastStore((s) => s.hide);

  useEffect(() => {
    if (!current) return;
    const ms = current.durationMs ?? (current.undo ? 6000 : 2200);
    const timer = setTimeout(() => hide(current.id), ms);
    return () => clearTimeout(timer);
  }, [current, hide]);

  if (!current) return null;
  const Icon = current.tone === 'error' ? CircleAlert : CircleCheck;
  const iconColor = current.tone === 'error' ? t.danger : t.success;

  return (
    <View pointerEvents="box-none" className="absolute left-0 right-0 items-center px-4" style={{ bottom: Math.max(insets.bottom, 12) + 74 }}>
      <Animated.View
        key={current.id}
        entering={FadeInDown.springify().damping(18)}
        exiting={FadeOutDown.duration(160)}
        accessibilityLiveRegion="polite"
        style={{
          width: '100%',
          maxWidth: 520,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          borderRadius: 16,
          paddingHorizontal: 16,
          paddingVertical: 12,
          backgroundColor: t.scheme === 'dark' ? '#F2F4F8' : '#15171E',
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
        }}
      >
        <Icon size={18} color={iconColor} />
        <Text className="flex-1 text-[14px] font-medium" style={{ color: t.scheme === 'dark' ? '#0E1116' : '#F2F4F8' }} numberOfLines={2}>
          {current.message}
        </Text>
        {current.undo ? (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Deshacer"
            hitSlop={10}
            onPress={async () => {
              haptics.light();
              hide(current.id);
              try {
                await current.undo?.();
                toast('Acción deshecha');
              } catch {
                toast('No se pudo deshacer', { tone: 'error' });
              }
            }}
            className="flex-row items-center gap-1 rounded-xl px-2 py-1"
          >
            <Undo2 size={16} color={t.scheme === 'dark' ? '#5B5BD6' : '#A3A9FB'} />
            <Text className="text-[14px] font-bold" style={{ color: t.scheme === 'dark' ? '#5B5BD6' : '#A3A9FB' }}>
              Deshacer
            </Text>
          </PressableScale>
        ) : null}
      </Animated.View>
    </View>
  );
}
