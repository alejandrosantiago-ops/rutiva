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
| `npm test` | Pruebas con `node --test` (dominio, zonas horarias, cronómetros, recordatorios, migraciones y persistencia sobre SQLite real) |
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
- **Sueño**:
  - *Registro manual*: hora de acostarse y de despertar (cruza la medianoche), minutos hasta dormirte, calidad (1–5) y notas; los registros anteriores se pueden corregir.
  - *Temporizador*: «Voy a dormir» guarda la hora exacta y «Me desperté» abre el registro para revisarlo. La sesión sobrevive a cerrar la app. Estos registros se marcan como **Estimado**: un temporizador mide tiempo en cama y **no detecta si estás dormido**.
  - Estadísticas: horas por noche, promedio semanal y mensual, meta configurable, gráfico real frente a objetivo, diferencia con la meta, deuda de sueño, horas medias e historial completo por meses. Recordatorio nocturno configurable desde la propia pantalla.
  - Preparado para **Health Connect** (Android) y **HealthKit** (iOS) en `src/services/health/`: contrato, adaptadores e importador que pide permiso explícito, solo lee sesiones de sueño y no duplica ni pisa registros manuales. Activarlo requiere un *development build* (ver comentarios en `providers.ts`).
- **Calendario**: mes actual con navegación, días completos (relleno), parciales (tono + porcentaje), sin cumplir (punto rojo) y en pausa (guion), día actual resaltado y resumen del mes. Al tocar una fecha muestra cada hábito con su estado («completado», «2.5 / 2.5 L», «no completado») y el progreso total; desde ahí se pueden corregir los registros. Filtro por hábito individual (incluidos los archivados).
- **Estadísticas** (siempre desde registros reales): cumplimiento de hoy, de la semana y del mes; racha actual y mejor racha histórica de días completos; gráfico de líneas diario, barras semanales y calendario de actividad; hábitos con mayor y menor cumplimiento; horas totales de entrenamiento y de estudio; agua de hoy y promedio diario; promedio de sueño; rendimiento por día de la semana.
- **Configuración**: nombre, tema, notificaciones, recordatorio nocturno, metas, inicio de semana, vibración, exportar copia y restablecer.

### Experiencia de uso

- **Bienvenida inicial** (solo la primera vez): nombre, primeros hábitos con su meta ajustable y metas de agua y sueño. Se puede omitir.
- **Deshacer**: desmarcar un hábito, añadir o borrar agua, sumar o fijar progreso, finalizar un cronómetro, pausar, archivar y eliminar muestran un aviso con «Deshacer» durante unos segundos. Eliminar además pide confirmación e indica cuánto historial se perdería.
- **Feedback al guardar** con avisos breves, animación y vibración al completar un hábito y celebración discreta al completar el día.
- **Una mano**: barra inferior, botón flotante «+» en la esquina inferior derecha y acciones principales de los formularios abajo.
- Modo claro/oscuro, estados vacíos explicativos, estados de carga y una pantalla de error con «Reintentar» si algo falla.

### Cómo se evalúa cada día

- Un hábito solo cuenta desde su **fecha de inicio**; los días anteriores no son incumplimientos.
- Al **cambiar la frecuencia o la meta**, la regla anterior se guarda en `scheduleHistory` y sigue aplicándose a los días pasados.
- Los días **en pausa** no cuentan. **Archivar** abre una pausa desde ese día, así el historial anterior sigue visible en el calendario y las estadísticas. Solo **eliminar** borra el hábito de todo.
- Un día a medias de hoy no penaliza: cuenta cuando termina o cuando se completa.

### Notas sobre recordatorios

- Los hábitos diarios o de días concretos sin fecha de fin usan avisos repetitivos del sistema.
- Los de intervalo o con fecha de fin programan avisos para los próximos 14 días y se renuevan cada vez que abres la app.
- iOS permite como máximo 64 notificaciones pendientes por app; con muchos hábitos y recordatorios conviene no pasar de ese número.

## Arquitectura

Organizada por **módulos funcionales**; dentro de cada uno se separan pantallas, componentes, estado y hooks.

```
src/
  app/                     Rutas de Expo Router: archivos finos que reexportan pantallas
  features/                Módulos funcionales
    home/        screens/
    habits/      screens/ components/ store/ (hábitos, cronómetro) hooks/
    calendar/    screens/ components/
    sleep/       screens/ components/ store/ (registros, sesión, recordatorio)
    water/       screens/ store/
    stats/       screens/ components/ (gráficos)
    settings/    screens/ store/
    onboarding/  screens/
  domain/                  Tipos TypeScript y lógica pura (fechas, rachas, programación,
                           sueño, agua, estadísticas, cronómetro, planificación de recordatorios)
  data/
    db/                    Conexión, interfaz Db, ejecutor de migraciones y migraciones
    repositories/          Contratos + implementación SQLite (factory inyectable)
  services/
    notifications/         Gestión de notificaciones (planificador puro + pasarela Expo)
    health/                Integración futura con Health Connect / HealthKit
  ui/                      Componentes visuales compartidos (tarjetas, formularios, progreso, avisos)
  hooks/                   Hooks compartidos (arranque, fecha actual)
  lib/                     Utilidades (hápticos, diálogos, navegación, calendario)
  theme/                   Paleta y colores
tests/                     node --test con un loader que resuelve los alias "@/"
```

Flujo: **pantallas → stores (Zustand) → repositorios (interfaces) → SQLite**. Las pantallas nunca usan SQL. La lógica de dominio no depende de React ni de Expo, por eso se prueba directamente.

## Base de datos

SQLite con migraciones versionadas (`PRAGMA user_version`), cada una en su transacción y con verificación de claves foráneas al terminar (`src/data/db/`).

| Tabla | Contenido | Integridad |
| --- | --- | --- |
| `categories` | Catálogo de categorías | nombre único |
| `habits` | **Definición** del hábito (nombre, categoría, tipo, unidad, fechas, hora sugerida) | FK a `categories`, CHECK de tipo y fechas |
| `habit_schedules` | **Programación y meta versionadas** (`valid_from` / `valid_until`, días como máscara de bits, intervalo, meta) | FK, CHECK, una sola versión vigente por hábito, sin solapes por fecha de inicio |
| `habit_pauses` | Pausas y archivados | FK, una sola pausa abierta por hábito |
| `habit_logs` | **Cumplimiento** de un hábito en una fecha | FK, único `(habit_id, date)` (upsert), `value >= 0` |
| `water_logs` | Cada registro de agua | `amount_ml > 0` |
| `sleep_logs` | Noches (manual, estimado o importado) | una noche activa por fecha, `external_id` único, FK a la sesión |
| `timed_sessions` | Cronómetros y sesiones «Voy a dormir» (activas, terminadas, descartadas) | una sola activa por tipo |
| `alarms` | Recordatorios: por hábito y hora, agua (ventana + intervalo) y hora de dormir | FK, único `(habit_id, time)`, agua y hora de dormir únicas |
| `scheduled_notifications` | Ids de los avisos programados en este dispositivo, por alarma | FK con borrado en cascada |
| `user_settings` | Preferencias del usuario (clave/valor) | clave única |

Los hábitos **no se crean cada día**: la app calcula qué toca en cada fecha a partir de `habit_schedules` y `habit_pauses` y solo guarda el progreso en `habit_logs`. Al editar la frecuencia o la meta se cierra la versión anterior, así el pasado no cambia. Archivar abre una pausa, de modo que el historial anterior sigue visible; eliminar es un borrado lógico (`deleted_at`) que se puede deshacer.

## Pruebas

`npm test` ejecuta las pruebas sobre el código real (sin mocks de dominio):

- **Cumplimiento** diario, semanal y mensual, días previos a la creación, rankings.
- **Repetición** diaria, semanal y por intervalos; cambios de programación y de meta.
- **Fecha y zona horaria**: cambio de día a medianoche local y semanas con cambio de hora en 5 zonas, noche del cambio de hora (Madrid) y recordatorios por fecha a la hora local correcta.
- **Agua**: totales, hábitos sincronizados con el módulo, persistencia y deshacer.
- **Cronómetros**: iniciar, pausar, reanudar, finalizar, descartar y reconstruir tras cerrar la app.
- **Sueño**: noches que cruzan medianoche, latencia, validaciones y comparación con la meta.
- **Rachas** por hábito y de días completos (actual y mejor).
- **Persistencia** con `node:sqlite`: repositorios, restricciones (duplicados, claves foráneas, CHECK), borrado lógico, reinicio y migraciones v1 → v4 con datos.
- **Recordatorios**: plan por tipo de hábito, límite de iOS, edición (cancela los anteriores) y cancelación al pausar o desactivar.

## Integrar Supabase o PostgreSQL más adelante

El esquema ya está preparado para sincronizar:

- ids **UUID** en todas las tablas (mapean a `uuid`);
- `created_at` y `updated_at` en ISO-8601 (mapean a `timestamptz`), útiles para resolver conflictos por última escritura;
- **borrado lógico** con `deleted_at`, para que las eliminaciones también se sincronicen;
- los ids de notificaciones son locales del dispositivo y no se exportan.

Pasos:

1. Crea en Supabase las tablas del apartado *Base de datos* (ver `src/data/db/v4.ts`), excepto `scheduled_notifications`, que es local del dispositivo, y añade `user_id uuid references auth.users` con políticas RLS.
2. Implementa la interfaz `Repositories` (`src/data/repositories/types.ts`), o mejor, un adaptador que siga escribiendo en SQLite y sincronice en segundo plano los registros con `updated_at` posterior a la última sincronización.
3. Cambia la implementación exportada en `src/data/repositories/index.ts`. Ni los stores ni las pantallas tienen que cambiar.
4. Añade la autenticación (Supabase Auth) como una ruta nueva en `src/app/`.

## Notas

- **Web**: solo sirve para desarrollo. `expo-sqlite` necesita las cabeceras COOP/COEP, que ya configura `metro.config.js`. Las notificaciones solo funcionan en Android e iOS.
- **Migraciones**: para cambiar el esquema añade una entrada nueva al final de `MIGRATIONS`. Nunca edites una migración que ya se haya publicado.

## Licencia

Copyright © 2026 alejandrosantiago-ops. Todos los derechos reservados.

El código es visible públicamente, pero no se concede ninguna licencia de uso, copia, modificación ni distribución sin permiso expreso del autor.
