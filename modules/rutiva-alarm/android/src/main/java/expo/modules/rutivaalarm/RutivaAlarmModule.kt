package expo.modules.rutivaalarm

import android.content.Context
import android.content.Intent
import android.provider.AlarmClock
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Crea alarmas REALES en la app Reloj del sistema mediante la API pública
 * AlarmClock (ACTION_SET_ALARM). La alarma la gestiona el propio Reloj:
 * suena en bucle a pantalla completa, permite posponer, funciona con Rutiva
 * cerrada y sobrevive a reinicios del teléfono.
 *
 * Limitación de Android: una app no puede leer, editar ni borrar en silencio
 * las alarmas del Reloj; para eso se abre la lista de alarmas (SHOW_ALARMS).
 */
class RutivaAlarmModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context no disponible" }

  private fun canHandle(intent: Intent): Boolean = intent.resolveActivity(context.packageManager) != null

  override fun definition() = ModuleDefinition {
    Name("RutivaAlarm")

    Function("isAvailable") {
      canHandle(Intent(AlarmClock.ACTION_SET_ALARM))
    }

    /**
     * @param days días en formato java.util.Calendar (1 = domingo … 7 = sábado).
     *             Vacío = alarma de una sola vez.
     */
    AsyncFunction("setAlarm") { hour: Int, minute: Int, days: List<Int>, label: String, vibrate: Boolean, skipUi: Boolean ->
      val intent = Intent(AlarmClock.ACTION_SET_ALARM).apply {
        putExtra(AlarmClock.EXTRA_HOUR, hour)
        putExtra(AlarmClock.EXTRA_MINUTES, minute)
        putExtra(AlarmClock.EXTRA_MESSAGE, label)
        putExtra(AlarmClock.EXTRA_VIBRATE, vibrate)
        putExtra(AlarmClock.EXTRA_SKIP_UI, skipUi)
        if (days.isNotEmpty()) {
          putIntegerArrayListExtra(AlarmClock.EXTRA_DAYS, ArrayList(days))
        }
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      if (canHandle(intent)) {
        context.startActivity(intent)
        true
      } else {
        false
      }
    }

    AsyncFunction("showAlarms") {
      val intent = Intent(AlarmClock.ACTION_SHOW_ALARMS).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
      if (canHandle(intent)) {
        context.startActivity(intent)
        true
      } else {
        false
      }
    }
  }
}
