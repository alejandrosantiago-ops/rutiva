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

- **Inicio**: saludo según la hora, fecha, porcentaje y anillo de progreso diario, racha de días cumpliendo todos los objetivos, **próximo hábito** (según su hora sugerida o recordatorio), resúmenes de **agua** (con botón rápido de +250 ml), **actividad física** (minutos de los hábitos de ejercicio) y **sueño**, tira semanal y lista de hábitos pendientes y completados con su control de progreso. Todo se actualiza al instante.
- **Hábitos** ilimitados con:
  - Información básica: nombre, descripción, **categoría** (Salud, Ejercicio, Hidratación, Estudio, Trabajo, Alimentación, Sueño, Productividad, Bienestar, Personalizado), icono, color y fecha de inicio.
  - **Cuatro tipos de seguimiento**: simple (casilla), **cantidad** con unidad y decimales (p. ej. 2.5 L, muestra lo que falta y permite sumar poco a poco), **duración** (meta en minutos u horas, **cronómetro** con iniciar/pausar/finalizar que sigue contando aunque cierres la app, y registro manual) y **frecuencia** (veces al día).
  - **Programación**: todos los días, días concretos o cada N días; fecha de inicio, fecha de fin opcional, hora sugerida y **hasta 5 recordatorios**.
  - Editar, **pausar** (los días pausados no cuentan ni rompen rachas), archivar y eliminar con confirmación que indica cuántos días de historial se borrarán.
  - El progreso es independiente por fecha: los hábitos aparecen solos cada día que toca y el historial se conserva siempre.
- **Hidratación** (`/water`, desde Inicio o Configuración): meta en litros o mililitros, botones de 150/250/500 ml, cantidad personalizada, anillo y barra de progreso, cantidad restante, registros del día (con borrado individual), historial de 14 días y recordatorios configurables (desde/hasta y cada cuánto). Un hábito de *Hidratación* medido en L o ml se alimenta automáticamente de este módulo.
- **Calendario**, **Sueño**, **Estadísticas** y **Configuración**, como en la primera versión.

### Notas sobre recordatorios

- Los hábitos diarios o de días concretos sin fecha de fin usan avisos repetitivos del sistema.
- Los de intervalo o con fecha de fin programan avisos para los próximos 14 días y se renuevan cada vez que abres la app.
- iOS permite como máximo 64 notificaciones pendientes por app; con muchos hábitos y recordatorios conviene no pasar de ese número.

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
  hooks/ lib/          Utilidades (fecha actual, progreso efectivo, hápticos, diálogos, navegación)
tests/                 Tests de dominio y de migraciones sobre SQLite real (node --test)
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
