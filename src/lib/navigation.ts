import { router, type Href } from 'expo-router';

/** Vuelve atrás; si no hay historial (p. ej. se abrió por enlace o notificación) va a `fallback`. */
export function goBack(fallback: Href = '/') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
