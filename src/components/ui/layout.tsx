import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { goBack } from '@/lib/navigation';
import { X } from 'lucide-react-native';
import { IconButton, Txt } from './primitives';

/** Contenedor de pantalla de pestaña: fondo, safe area y scroll. */
export function Screen({
  children,
  title,
  subtitle,
  right,
  scroll = true,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  scroll?: boolean;
}) {
  const header = title ? (
    <View className="flex-row items-end justify-between pb-2 pt-3">
      <View className="flex-1 pr-3">
        {subtitle ? <Txt variant="overline">{subtitle}</Txt> : null}
        <Txt variant="display" className="mt-0.5">
          {title}
        </Txt>
      </View>
      {right}
    </View>
  ) : null;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-canvas dark:bg-canvas-dark">
      {scroll ? (
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 pb-32"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {header}
          {children}
        </ScrollView>
      ) : (
        <View className="flex-1 px-5">
          {header}
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}

/** Contenedor para pantallas modales (formularios). */
export function ModalScreen({
  title,
  children,
  footer,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-canvas dark:bg-canvas-dark">
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View className="flex-row items-center justify-between px-5 pb-2 pt-2">
          <Txt variant="title">{title}</Txt>
          <IconButton icon={X} label="Cerrar" onPress={() => goBack()} size={40} />
        </View>
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 pb-10 pt-2"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
        {footer ? <View className="border-t border-line px-5 pb-2 pt-3 dark:border-line-dark">{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
