import { Platform } from 'react-native';

/*
 * Inicio de sesión con Google usando la cuenta que ya está en el teléfono
 * (selector de cuentas nativo de Android). Devuelve un "ID token" firmado por
 * Google que Supabase verifica; el correo llega ya verificado por Google.
 *
 * Configuración (ver README): EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID con el ID de
 * cliente "Aplicación web" de Google Cloud, y un cliente "Android" con el
 * paquete com.rutiva.app y la huella SHA-1 de la firma de EAS.
 *
 * El módulo es nativo: no existe en Expo Go ni en la web, por eso se carga de
 * forma diferida y la app ofrece solo el correo cuando no está disponible.
 */

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

type GoogleModule = typeof import('@react-native-google-signin/google-signin');

let mod: GoogleModule | null | undefined;
let configured = false;

function load(): GoogleModule | null {
  if (mod !== undefined) return mod;
  mod = null;
  if (Platform.OS === 'web' || !WEB_CLIENT_ID) return mod;
  if (Platform.OS === 'ios' && !IOS_CLIENT_ID) return mod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('@react-native-google-signin/google-signin') as GoogleModule;
  } catch {
    mod = null; // Expo Go: el módulo nativo no está incluido.
  }
  return mod;
}

function client() {
  const m = load();
  if (!m) return null;
  if (!configured) {
    m.GoogleSignin.configure({ webClientId: WEB_CLIENT_ID, iosClientId: IOS_CLIENT_ID });
    configured = true;
  }
  return m;
}

/** Por qué no se puede usar Google aquí, o `null` si sí se puede. */
export function googleUnavailableReason(): string | null {
  if (Platform.OS === 'web') return 'En la versión web, entra con tu correo.';
  if (!WEB_CLIENT_ID || (Platform.OS === 'ios' && !IOS_CLIENT_ID)) return 'El acceso con Google aún no está configurado.';
  try {
    return client() ? null : 'Disponible en la app instalada (no en Expo Go).';
  } catch {
    return 'Disponible en la app instalada (no en Expo Go).';
  }
}

export class GoogleCancelled extends Error {
  constructor() {
    super('Inicio con Google cancelado');
  }
}

/** Abre el selector de cuentas de Google y devuelve el ID token. */
export async function googleIdToken(): Promise<string> {
  const m = client();
  if (!m) throw new Error(googleUnavailableReason() ?? 'Google no disponible.');
  const { GoogleSignin, isSuccessResponse, isErrorWithCode, statusCodes } = m;
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    // Siempre muestra el selector, para poder elegir otra cuenta.
    await GoogleSignin.signOut().catch(() => undefined);
    const res = await GoogleSignin.signIn();
    if (!isSuccessResponse(res)) throw new GoogleCancelled();
    if (!res.data.idToken) throw new Error('Google no devolvió el token. Revisa el ID de cliente web.');
    return res.data.idToken;
  } catch (e) {
    if (e instanceof GoogleCancelled) throw e;
    if (isErrorWithCode(e)) {
      if (e.code === statusCodes.SIGN_IN_CANCELLED) throw new GoogleCancelled();
      if (e.code === statusCodes.IN_PROGRESS) throw new Error('Ya hay un inicio de sesión en curso.');
      if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) throw new Error('Este teléfono no tiene Google Play Services actualizado.');
      // DEVELOPER_ERROR (10): SHA-1 o paquete no registrados en Google Cloud.
      if (String(e.code) === '10' || /DEVELOPER_ERROR/.test(String(e.code)))
        throw new Error('Google rechazó la app: falta registrar la huella SHA-1 o el paquete com.rutiva.app en Google Cloud.');
    }
    throw e;
  }
}

/** Olvida la cuenta de Google elegida (al cerrar sesión). */
export async function googleSignOut() {
  const m = load();
  if (m && configured) await m.GoogleSignin.signOut().catch(() => undefined);
}
