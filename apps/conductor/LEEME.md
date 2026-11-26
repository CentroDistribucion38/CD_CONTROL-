# CONTROL Conductor (Android)

La app que usan los conductores. Abre **Traspasos → Compartir ubicación** de CONTROL, pero el GPS lo lleva Android en
segundo plano: **sigue mandando la ubicación con el celular bloqueado, en otra app o con la pantalla apagada** (con el
aviso fijo «CONTROL está siguiendo el viaje»). Las posiciones van por HTTP nativo a `/api/traspasos/gps/traccar`.

- Se compila sola en GitHub (`.github/workflows/app-conductor.yml`) cuando cambia algo aquí, o a mano desde Actions.
- El APK queda en **Releases** del repositorio (`control-conductor.apk`). Se reparte por WhatsApp o enlace.
- Firma fija (`android/app/control-conductor.jks` + `android/firma.properties`): cada versión se instala encima.
- La dirección de CONTROL está en `capacitor.config.json` (`server.url`). Si cambia el dominio, cámbiala ahí.

Instalar en el celular: abrir el APK → permitir «Instalar apps desconocidas» → abrir CONTROL Conductor → iniciar
sesión → escribir la placa → **Empezar a compartir** → permitir ubicación (mejor «Permitir todo el tiempo») y
notificaciones → en Ajustes → Apps → CONTROL Conductor → Batería: **Sin restricciones**.
