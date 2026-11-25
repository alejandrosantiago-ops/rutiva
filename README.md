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
  - **Health Connect** (Android) implementado en `src/services/health/`: pide permiso explícito, solo lee sesiones de sueño, descuenta el tiempo despierto y no duplica ni pisa registros manuales. Requiere la app instalada (no Expo Go). **HealthKit** (iOS) queda preparado; activarlo exige compilar en un Mac (ver `providers.ts`).
- **Calendario**: mes actual con navegación, días completos (relleno), parciales (tono + porcentaje), sin cumplir (punto rojo) y en pausa (guion), día actual resaltado y resumen del mes. Al tocar una fecha muestra cada hábito con su estado («completado», «2.5 / 2.5 L», «no completado») y el progreso total; desde ahí se pueden corregir los registros. Filtro por hábito individual (incluidos los archivados).
- **Estadísticas** (siempre desde registros reales): cumplimiento de hoy, de la semana y del mes; racha actual y mejor racha histórica de días completos; gráfico de líneas diario, barras semanales y calendario de actividad; hábitos con mayor y menor cumplimiento; horas totales de entrenamiento y de estudio; agua de hoy y promedio diario; promedio de sueño; rendimiento por día de la semana.
- **Configuración**: nombre, tema, notificaciones, recordatorio nocturno, metas, inicio de semana, vibración, exportar copia y restablecer.

- **Despertador** (Configuración o Sueño → Despertador): varias alarmas con hora, días, nombre, sonido, posponer y activación. Al sonar abre una pantalla de **buenos días** con los hábitos pendientes. Ver *Alarmas reales* más abajo.
- **Recordatorios**: uno o varios por hábito, diarios o semanales, con **mensaje propio** («Hora de entrenar») o uno según la categoría; se pueden **activar o desactivar** sin perder las horas. Se reprograman al editar y se cancelan al pausar, archivar o eliminar. Tocar un aviso abre su pantalla, también con la app cerrada.
- **Cronómetro**: Iniciar, Pausar, Continuar y Finalizar; sesiones guardadas en SQLite, aviso fijo mientras corre y aviso al llegar a la meta.
- **Copias de seguridad**: exportar a un archivo `.json` (menú compartir) e **importar** (también copias de versiones anteriores), con confirmación.
- **Ordenar hábitos** arrastrando el asa de cada tarjeta (Hábitos → Ordenar).
- **Health Connect** (Android): importar el sueño de los últimos 30 días, con permiso solo de lectura.
- **Cuenta y sincronización** opcional con Supabase (ver más abajo).

### Alarmas reales

| | Android | iOS |
| --- | --- | --- |
| **Reloj del sistema** | Alarma real en la app Reloj (`AlarmClock.ACTION_SET_ALARM`, módulo nativo `modules/rutiva-alarm`): suena hasta apagarla, a pantalla completa, con Rutiva cerrada. Requiere la app instalada (no Expo Go). Para borrarla o cambiarla después, hay que hacerlo también en el Reloj: Android no permite a otras apps modificar esas alarmas. | No existe: iOS no deja crear alarmas del sistema (salvo AlarmKit en iOS 26+). |
| **Aviso de Rutiva** | Notificación exacta (`setAlarmClock`), canal con audio de **alarma**, salta el No molestar, posponer. Suena una vez (~25 s). | Notificación *time sensitive* con sonido; respeta el modo silencio. |

Permisos de Android: `USE_EXACT_ALARM`/`SCHEDULE_EXACT_ALARM` (avisos exactos) y `SET_ALARM` (crear alarmas en el Reloj). Los sonidos son tonos propios generados con `scripts/generate-sounds.ps1`; en Expo Go se usa el sonido del sistema.

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
    alarm/       screens/ store/ (despertador, buenos días)
    account/     screens/ store/ (cuenta y sincronización)
  domain/                  Tipos TypeScript y lógica pura (fechas, rachas, programación,
                           sueño, agua, estadísticas, cronómetro, planificación de recordatorios)
  data/
    db/                    Conexión, interfaz Db, ejecutor de migraciones y migraciones
    repositories/          Contratos + implementación SQLite (factory inyectable)
    sync/                  Motor de sincronización y adaptador de Supabase
    backup.ts              Lectura y validación de copias de seguridad
  services/
    notifications/         Gestión de notificaciones (planificador puro + pasarela Expo)
    health/                Health Connect (real) y HealthKit (preparado)
  ui/                      Componentes visuales compartidos (tarjetas, formularios, progreso, avisos)
  hooks/                   Hooks compartidos (arranque, fecha actual)
  lib/                     Utilidades (hápticos, diálogos, navegación, calendario)
  theme/                   Paleta y colores
modules/rutiva-alarm/      Módulo nativo (Kotlin) para alarmas del Reloj de Android
supabase/schema.sql        Esquema del servidor de sincronización (opcional)
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
- **Recordatorios**: plan por tipo de hábito, límite de iOS, edición (cancela los anteriores), cancelación al pausar o desactivar, mensajes personalizados y pantalla que abre cada aviso.
- **Despertador**: avisos por día, próxima vez que suena, posponer y persistencia.
- **Copias de seguridad**: exportar → importar sin pérdidas, copias antiguas y archivos inválidos.
- **Health Connect**: conversión de sesiones y plan de importación (sin duplicar ni pisar registros manuales).
- **Sincronización**: dos dispositivos contra un servidor simulado (alta, cambios, borrados, conflictos, una noche por fecha, estabilización) y conversión exacta de filas de Postgres.

## Sincronización con Supabase (opcional)

La app es *offline-first*: siempre guarda en SQLite y funciona sin internet. Si configuras Supabase e inicias sesión (Configuración → Cuenta y sincronización), los datos se copian en la nube y se comparten entre dispositivos.

1. Crea un proyecto gratuito en [supabase.com](https://supabase.com).
2. En **SQL Editor**, ejecuta `supabase/schema.sql` (tabla `rutiva_records` con Row Level Security y la función `rutiva_push`).
3. Crea `.env.local` en la raíz del proyecto con los datos de **Project Settings → API**:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=tu-clave-anon
   ```
4. Reinicia `npx expo start`. La clave *anon* es pública por diseño; la seguridad la da RLS (cada usuario solo ve sus filas).

Cómo funciona (`src/data/sync/`): se sincronizan hábitos (con programación, pausas y horas de recordatorio), cumplimientos, agua, sueño y metas/nombre. Las alarmas de despertar, los avisos programados y el cronómetro son de cada teléfono. En los conflictos gana la edición más reciente (también en el servidor, dentro de `rutiva_push`), los borrados se propagan con `deleted_at` y la descarga usa el reloj del servidor (`synced_at`), así un teléfono con la hora atrasada no hace perder cambios. Se sincroniza al abrir la app, al volver a ella (como mucho una vez por minuto) y con «Sincronizar ahora».

## Notas

- **Web**: solo sirve para desarrollo. `expo-sqlite` necesita las cabeceras COOP/COEP, que ya configura `metro.config.js`. Las notificaciones solo funcionan en Android e iOS.
- **Migraciones**: para cambiar el esquema añade una entrada nueva al final de `MIGRATIONS`. Nunca edites una migración que ya se haya publicado.

## Licencia

Copyright © 2026 alejandrosantiago-ops. Todos los derechos reservados.

El código es visible públicamente, pero no se concede ninguna licencia de uso, copia, modificación ni distribución sin permiso expreso del autor.
