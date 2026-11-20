import { Alert, Platform } from 'react-native';

/** Aviso simple. En web `Alert.alert` no hace nada, por eso se usa `window.alert`. */
export function showAlert(title: string, message: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

/** Muestra un error al usuario y lo deja registrado en consola. */
export function showError(title: string, error: unknown) {
  console.error(`[Rutiva] ${title}`, error);
  showAlert(title, error instanceof Error ? error.message : 'Inténtalo de nuevo.');
}

/** Confirmación destructiva. */
export function confirmAction(title: string, message: string, actionLabel: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancelar', style: 'cancel' },
    { text: actionLabel, style: 'destructive', onPress: onConfirm },
  ]);
}
