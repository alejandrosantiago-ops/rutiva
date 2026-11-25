import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Cloud, CloudOff, LogIn, LogOut, RefreshCw, ShieldCheck, UserPlus, WifiOff } from 'lucide-react-native';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale/es';
import { useSyncStore } from '@/features/account/store/useSyncStore';
import { useTheme } from '@/theme/colors';
import { goBack } from '@/lib/navigation';
import { confirmAction, showAlert, showError } from '@/lib/dialogs';
import { KeyboardSafe } from '@/ui/layout';
import { Button, Card, IconButton, Txt } from '@/ui/primitives';
import { FieldLabel, Segmented, TextField } from '@/ui/form';
import { toast } from '@/ui/toast';

type Mode = 'signIn' | 'signUp';

export default function AccountScreen() {
  const t = useTheme();
  const { status, email, lastSyncAt, error } = useSyncStore();
  const { signIn, signUp, signOut, syncNow } = useSyncStore.getState();
  const [mode, setMode] = useState<Mode>('signIn');
  const [form, setForm] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const valid = /\S+@\S+\.\S+/.test(form.email) && form.password.length >= 8;

  const submit = async () => {
    setBusy(true);
    try {
      if (mode === 'signIn') {
        await signIn(form.email, form.password);
        toast('Sesión iniciada y datos sincronizados');
      } else {
        const r = await signUp(form.email, form.password);
        if (r === 'confirmEmail') showAlert('Revisa tu correo', 'Te enviamos un enlace para confirmar la cuenta. Después, inicia sesión aquí.');
        else toast('Cuenta creada y datos sincronizados');
      }
    } catch (e) {
      showError(mode === 'signIn' ? 'No se pudo iniciar sesión' : 'No se pudo crear la cuenta', e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-canvas dark:bg-canvas-dark">
      <KeyboardSafe>
        <View className="flex-row items-center gap-3 px-5 py-2">
          <IconButton icon={ChevronLeft} label="Volver" onPress={() => goBack('/settings')} size={40} />
          <Txt variant="title">Cuenta y sincronización</Txt>
        </View>
        <ScrollView contentContainerClassName="px-5 pb-10" keyboardShouldPersistTaps="handled">
          <Card className="mt-3 flex-row gap-3">
            <ShieldCheck size={20} color={t.success} />
            <Txt variant="caption" className="flex-1 leading-5">
              Rutiva funciona sin internet y guarda todo en tu teléfono. La cuenta es opcional: sirve para tener una copia en la nube y usar
              tus hábitos en varios dispositivos.
            </Txt>
          </Card>

          {status === 'unconfigured' ? (
            <Card className="mt-4">
              <View className="flex-row items-center gap-2">
                <CloudOff size={18} color={t.muted} />
                <Txt variant="heading">Sincronización no configurada</Txt>
              </View>
              <Txt variant="caption" className="mt-2 leading-5">
                Para activarla hace falta un proyecto gratuito de Supabase: ejecuta supabase/schema.sql en su editor SQL y añade
                EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY en el archivo .env.local del proyecto (los pasos están en el README).
              </Txt>
            </Card>
          ) : status === 'signedOut' ? (
            <>
              <View className="mt-5">
                <Segmented<Mode>
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: 'signIn', label: 'Iniciar sesión' },
                    { value: 'signUp', label: 'Crear cuenta' },
                  ]}
                />
              </View>
              <FieldLabel>Correo</FieldLabel>
              <TextField
                value={form.email}
                onChangeText={(v) => setForm((f) => ({ ...f, email: v }))}
                placeholder="tucorreo@ejemplo.com"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
              />
              <FieldLabel hint="Mínimo 8 caracteres">Contraseña</FieldLabel>
              <TextField
                value={form.password}
                onChangeText={(v) => setForm((f) => ({ ...f, password: v }))}
                placeholder="Tu contraseña"
                secureTextEntry
                autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
              />
              <Button
                className="mt-6"
                icon={mode === 'signIn' ? LogIn : UserPlus}
                title={busy ? 'Un momento…' : mode === 'signIn' ? 'Iniciar sesión' : 'Crear cuenta'}
                disabled={!valid || busy}
                onPress={submit}
              />
              <Txt variant="caption" className="mt-3 text-center">
                Al entrar, tus datos de este teléfono se suben y se combinan con los de la cuenta.
              </Txt>
            </>
          ) : (
            <>
              <Card className="mt-4">
                <View className="flex-row items-center gap-2">
                  <Cloud size={18} color={t.brand} />
                  <Txt variant="heading" className="flex-1" numberOfLines={1}>
                    {email}
                  </Txt>
                </View>
                <Txt variant="caption" className="mt-2">
                  {status === 'syncing'
                    ? 'Sincronizando…'
                    : lastSyncAt
                      ? `Última sincronización ${formatDistanceToNow(new Date(lastSyncAt), { locale: es, addSuffix: true })}`
                      : 'Aún no se ha sincronizado'}
                </Txt>
                {status === 'error' && error ? (
                  <View className="mt-3 flex-row items-center gap-2 rounded-2xl bg-warning/10 px-3 py-2">
                    <WifiOff size={16} color={t.warning} />
                    <Txt variant="caption" className="flex-1">
                      {error}
                    </Txt>
                  </View>
                ) : null}
              </Card>
              <Button
                className="mt-4"
                icon={RefreshCw}
                title={status === 'syncing' ? 'Sincronizando…' : 'Sincronizar ahora'}
                disabled={status === 'syncing'}
                onPress={async () => {
                  try {
                    const r = await syncNow();
                    if (r) toast(r.pulled || r.pushed ? `Sincronizado: ${r.pulled} recibidos, ${r.pushed} enviados` : 'Todo al día');
                  } catch (e) {
                    showError('No se pudo sincronizar', e);
                  }
                }}
              />
              <Button
                className="mt-3"
                variant="secondary"
                icon={LogOut}
                title="Cerrar sesión"
                onPress={() =>
                  confirmAction('Cerrar sesión', 'Tus datos se quedan en este teléfono; solo dejará de sincronizarse.', 'Cerrar sesión', async () => {
                    await signOut();
                    toast('Sesión cerrada');
                  })
                }
              />
            </>
          )}
        </ScrollView>
      </KeyboardSafe>
    </SafeAreaView>
  );
}
