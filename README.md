# Rutiva

Aplicación móvil (Android e iOS) para organizar hábitos diarios, registrar su cumplimiento, recibir recordatorios, ver el progreso en un calendario y llevar el control del sueño. Funciona sin conexión: todos los datos se guardan en SQLite en el dispositivo.

## Puesta en marcha

```bash
npm install
npx expo start          # abre con Expo Go (Android/iOS) escaneando el QR
npx expo start --web    # vista web para desarrollo
```

| Comando | Qué hace |
| --- | --- |
| `npm run typecheck` | Comprobación de tipos con TypeScript |
| `npx eslint src` | Lint (configuración de Expo + React Compiler) |
| `npm test` | Tests de la lógica de dominio (rachas, progreso, sueño, estadísticas) |
| `npx expo-doctor` | Revisa la compatibilidad de las dependencias con el SDK |

> Expo Go basta para todo, notificaciones locales incluidas. Para publicar en las tiendas usa EAS Build (`npx eas-cli@latest build`).

## Stack

Expo SDK 58 · React Native 0.88 · TypeScript · Expo Router · NativeWind 4 (Tailwind 3) · Zustand · Expo SQLite · Expo Notifications · React Native Calendars · Reanimated 4 · Lucide · date-fns.

## Funcionalidades

- **Inicio**: saludo, progreso del día en un anillo animado, tira semanal con el cumplimiento de cada día (al tocar un día puedes registrar días pasados), lista de hábitos pendientes y completados, y resumen del sueño.
- **Hábitos**: crear, editar, archivar y eliminar. Icono, color, frecuencia (diaria o días concretos), meta diaria con unidad (p. ej. 8 vasos) y recordatorio con hora.
- **Detalle de hábito**: racha actual y mejor racha, cumplimiento en los últimos 30 días, total, y un mapa de calor mensual donde puedes marcar días pasados.
- **Calendario**: mapa de calor mensual de todos los hábitos o de uno solo, y edición del día seleccionado.
- **Sueño**: registro de la hora de acostarse y de despertar (se calcula bien aunque la noche cruce la medianoche), calidad del 1 al 5 y notas. Gráfico de 7 o 30 días con la línea de tu meta, promedio, porcentaje de meta cumplida, hora media de acostarse y levantarse, y constancia.
- **Estadísticas**: cumplimiento, días perfectos, rachas, gráfico diario o semanal (7/30/90 días), rendimiento por día de la semana y ranking de hábitos.
- **Configuración** (icono de engranaje en Inicio): nombre, tema sistema/claro/oscuro, recordatorios activados o no, recordatorio para dormir, meta de sueño, inicio de semana, vibración, exportar copia en JSON y restablecer datos.

## Arquitectura

```
src/
  app/                 Rutas de Expo Router (cada archivo es una pantalla)
    (tabs)/            Inicio, Hábitos, Calendario, Sueño, Estadísticas
    habit/             new, [id] (detalle), edit/[id]
    sleep/new          Registro / edición de sueño (?id=)
    settings           Configuración
  domain/              Lógica pura sin React: tipos, fechas, rachas, sueño, estadísticas
  db/                  Conexión SQLite y migraciones versionadas (PRAGMA user_version)
  repositories/        Interfaces de persistencia + implementación SQLite
  stores/              Estado global con Zustand (actualizaciones optimistas)
  services/            Notificaciones locales
  components/          UI reutilizable (ui/, habits/, calendar/, sleep/, stats/)
  theme/               Paleta (compartida con Tailwind) y colores para props JS
  hooks/ lib/          Utilidades (fecha actual, hápticos, diálogos, navegación)
tests/                 Tests de dominio (node --test)
```

El flujo es: **pantallas → stores (Zustand) → repositorios (interfaces) → SQLite**. Las pantallas nunca usan SQL directamente.

## Integrar Supabase o PostgreSQL más adelante

El esquema ya está preparado para sincronizar:

- ids **UUID** en todas las tablas (mapean a `uuid`);
- `created_at` y `updated_at` en ISO-8601 (mapean a `timestamptz`), útiles para resolver conflictos por última escritura;
- **borrado lógico** con `deleted_at`, para que las eliminaciones también se sincronicen;
- los ids de notificaciones son locales del dispositivo y no se exportan.

Pasos:

1. Crea en Supabase las tablas `habits`, `habit_logs`, `sleep_logs` y `settings` con las mismas columnas (ver `src/db/migrations.ts`), y añade `user_id uuid references auth.users` con políticas RLS.
2. Implementa la interfaz `Repositories` (`src/repositories/types.ts`) en `src/repositories/supabase/`, o mejor, un adaptador que siga escribiendo en SQLite y sincronice en segundo plano los registros con `updated_at` posterior a la última sincronización.
3. Cambia la implementación exportada en `src/repositories/index.ts`. Ni los stores ni las pantallas tienen que cambiar.
4. Añade la autenticación (Supabase Auth) como una ruta nueva en `src/app/`.

## Notas

- **Web**: solo sirve para desarrollo. `expo-sqlite` necesita las cabeceras COOP/COEP, que ya configura `metro.config.js`. Las notificaciones solo funcionan en Android e iOS.
- **Migraciones**: para cambiar el esquema añade una entrada nueva al final de `MIGRATIONS`. Nunca edites una migración que ya se haya publicado.

## Licencia

Copyright © 2026 alejandrosantiago-ops. Todos los derechos reservados.

El código es visible públicamente, pero no se concede ninguna licencia de uso, copia, modificación ni distribución sin permiso expreso del autor.
