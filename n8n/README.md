# Comunicados por correo → Yachi (n8n)

Los comunicados de la Dirección de Comunicación se reenvían **como adjunto** a un Gmail "robot"; n8n revisa ese buzón cada minuto y se los pasa a la API (`POST /ingest/email`), que los limpia, clasifica, divide en fragmentos y guarda en la base de conocimiento. Desde ese momento Yachi puede citarlos.

```
Outlook YT ──reenvío con el .eml adjunto──► Gmail robot ──IMAP──► n8n ──► POST /ingest/email ──► documents / chunks
```

Hay dos formas de probarlo. La **A** no necesita Gmail ni n8n; la **B** es el flujo completo.

## 0. Requisitos (ambas formas)

1. Corpus del equipo (confidencial, se pasa por un canal privado) copiado **directamente** en `rag/`: debe contener `chunks.jsonl`, `fuentes.csv`, `descripciones.csv`, `corpus/` y `datos/*.xlsx` (`tramites.json` es opcional). Si llega anidado como `rag/rag/…`, mueve su contenido a `rag/`. Y `.env` creado a partir de `.env.example` con `ANTHROPIC_API_KEY`.
2. En `.env`, agrega:
   ```
   INGEST_TOKEN=<genera uno: py -c "import secrets; print(secrets.token_urlsafe(32))">
   EMAIL_ALLOWED_SENDERS=comunicacion@yachaytech.edu.ec
   EMAIL_FORWARDERS=<tu-correo>@yachaytech.edu.ec
   ```
   `EMAIL_FORWARDERS` es quién puede reenviar comunicados al robot (separados por coma).
3. Levanta la base y la API (el `build` es necesario si ya habías construido antes de traer esta rama: sin él la API no tiene `/ingest/email`):
   ```
   docker compose build seed api
   docker compose up -d db
   docker compose run --rm seed            # esquema + corpus (la primera vez tarda ~2 min)
   docker compose run --rm seed python -m app.migrate   # otra vez: en una base nueva las descripciones del catálogo quedan vacías si no
   docker compose up -d --no-deps api
   ```
   Comprueba: `curl.exe http://127.0.0.1:8000/health` → `"agent": true` (en PowerShell escribe `curl.exe`, no `curl`). Usa `127.0.0.1`, no `localhost` (en Windows `localhost` puede tardar ~20 s).

## A. Prueba rápida sin Gmail ni n8n

Con uno o más comunicados guardados como `.eml` (en Outlook: abrir el correo → `…` → Guardar como / Descargar). Guárdalos **fuera del repo** (p. ej. `C:/correos`): pueden tener datos personales y no deben subirse (`*.eml` está en `.gitignore` por si acaso).

```
docker compose run --rm --no-deps -v "C:/ruta/a/tus/correos:/correos:ro" seed sh -c "python -m app.email_ingest /correos/*.eml"
```

Cada línea muestra el documento creado, su tipo, su tema, cuántos fragmentos y los tokens gastados en clasificarlo. Luego pregúntale a Yachi por ese comunicado.

## B. Flujo completo con Gmail + n8n

### B1. Tu propio Gmail robot (≈10 min)

Cada persona usa **su propio** buzón: si dos n8n leen el mismo, el primero marca el correo como leído y el otro no lo ve.

1. Crea una cuenta de Gmail nueva (con tus datos reales: es tu cuenta, solo se usa como robot).
2. Activa la **verificación en 2 pasos** con tu teléfono: https://myaccount.google.com/security
3. Crea una **contraseña de aplicación** llamada `n8n`: https://myaccount.google.com/apppasswords → copia las 16 letras (no las compartas ni las subas al repo).
4. En ese Gmail, crea un filtro para que tus reenvíos no caigan en Spam: buscar → opciones → **De:** `<tu-correo>@yachaytech.edu.ec` → Crear filtro → **No enviarlo nunca a Spam**.

### B2. Levantar n8n e importar el flujo

```
docker compose --profile correo up -d n8n
docker compose exec -T n8n n8n import:workflow --input=/workflows/flujo-correos.json
```

En **Git Bash** antepón `MSYS_NO_PATHCONV=1` al segundo comando (si no, convierte `/workflows/...` en una ruta de Windows).

### B3. Configurarlo en el editor

1. Abre http://127.0.0.1:5678 y crea la **cuenta de dueño** (local, solo para este n8n).
2. Abre el flujo **"Yachi · Comunicados por correo"** → doble clic en **"Correo nuevo en el buzón robot"** → *Credential to connect with* → **Create new credential** (IMAP):
   - User: tu Gmail robot · Password: la contraseña de aplicación · Host: `imap.gmail.com` · Port: `993` · SSL/TLS: activado.
   - **Save** → debe decir *Connection tested successfully*.
3. Pulsa **Publish** (arriba a la derecha) para que revise el buzón cada minuto sin dejar el editor abierto. Si luego editas el flujo, vuelve a publicarlo.

### B4. Reenviar un comunicado

El reenvío tiene que llevar el **correo original adjunto** (`.eml`): conserva su fecha, su remitente y su identificador. Un reenvío normal (texto copiado bajo "RV:") se rechaza.

- **Outlook web / Outlook nuevo:** `…` → Reenviar → **Reenviar como datos adjuntos**.
- Si esa opción no aparece: abre un **correo nuevo** al Gmail robot y **arrastra** el comunicado desde la lista hasta el borrador; o adjunta el `.eml` descargado.

En 1–2 minutos aparece una ejecución en la pestaña **Executions** del flujo. El último nodo muestra lo que se guardó.

Para preguntarle a Yachi, levanta la web conectada a tu API local (sin `web/.env.local` usa un simulador y no verás tus comunicados):

```
cd web
copy .env.example .env.local     # y cambia la línea a: VITE_API_URL=http://127.0.0.1:8000
npm install
npm run dev -- --host 127.0.0.1
```

Abre http://127.0.0.1:5180 y pregunta por el comunicado: en las fuentes debe aparecer «Comunicado DD/MM/AAAA: …».

## Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| El nodo "Extraer…" dice *Se reenvió de forma normal, sin el comunicado adjunto* | Se usó "Reenviar" normal. Reenvía como adjunto (o arrastra el correo al borrador). |
| El nodo HTTP responde **503** `ingest_disabled` | La API arrancó sin `INGEST_TOKEN`. Agrégalo en `.env` y recrea la API: `docker compose up -d --no-deps api`. |
| El nodo HTTP responde **401** `invalid_ingest_token` | El token de n8n está vacío o es distinto al de la API: revisa `.env` y recrea ambos (`docker compose --profile correo up -d n8n` y `docker compose up -d --no-deps api`). |
| El nodo HTTP responde **404** | La imagen de la API es anterior a esta rama: `docker compose build api` y `docker compose up -d --no-deps api`. |
| El nodo HTTP responde **403** *No está autorizado para reenviar* | Tu correo de YT no está en `EMAIL_FORWARDERS`. Agrégalo en `.env` y recrea la API. |
| El nodo HTTP responde **422** *no viene de una fuente oficial* | El correo adjunto no es de `comunicacion@yachaytech.edu.ec`. Solo se aceptan comunicados oficiales. |
| No pasa nada al reenviar | Revisa la carpeta **Spam** del Gmail robot y que el flujo esté **publicado**. |
| La credencial IMAP falla | Usuario = Gmail completo; contraseña = la **de aplicación** (no la normal); verificación en 2 pasos activa. |

## Detalles técnicos

- El formato **RAW** del nodo IMAP **no sirve**: aunque su descripción diga "mensaje completo", entrega el cuerpo sin cabeceras. Por eso el flujo usa el formato *resolved* y toma el `.eml` adjunto.
- El nodo HTTP lee `INGEST_TOKEN` y `YACHI_API_URL` de las variables de entorno del contenedor n8n (`docker-compose.yml`, perfil `correo`).
- Reimportar el flujo actualiza el mismo (id fijo `yachiCorreos0001`), pero hay que **volver a elegir la credencial** en el primer nodo.
