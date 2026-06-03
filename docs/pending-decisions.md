# Decisiones arquitectónicas pendientes

> **Cómo leer este documento**: cada decisión está formateada como un ADR ligero. El dueño del proyecto debe revisarlas, elegir una opción (o proponer una nueva), y registrar la decisión inline (tachando las opciones descartadas y añadiendo fecha + razón). Cuando una decisión se toma, se mueve a `docs/adr/` o se anota en el roadmap.

> **Importante**: las "recomendaciones tentativas" en cada decisión son sugerencias basadas en el análisis del código y los documentos de [`analysis/scaling.md`](analysis/scaling.md) y [`analysis/offline-strategy.md`](analysis/offline-strategy.md). No son finales.

---

## Índice

| ID | Pregunta | Bloquea | Recomendación |
|----|----------|---------|---------------|
| D-001 | Multi-tenant duro o blando | Escalado | Mantener blando (A) |
| D-002 | Registro abierto vs whitelist | Publicación | Whitelist por invitación inicialmente (B) |
| D-003 | Stats: duplicar lógica o endpoint raw | Offline Capa 3 | Duplicar con tests de paridad (A) |
| D-004 | Notas online-only u offline | Offline Capa 4 | Online-only en primera iteración (A) |
| D-005 | Storage de imágenes: local vs object | Scaling F3 | Local + Cloudflare CDN (A) |
| D-006 | JWT revocation o aceptar limitación | Security alto | Implementar tabla en Postgres (A) |
| D-007 | Modelo de pricing/monetización | Diseño general | Definir antes de aceptar usuarios |
| D-008 | Postgres compartido o aislado | Escalado | Mantener compartido (A) |
| D-009 | SLA pretendido | Observabilidad | "Best effort" inicial (A) |
| D-010 | IDs SERIAL vs UUID client-generated | Offline Capa 4 | Postponer hasta validar caso de uso |
| D-011 | Tests bloqueantes en CI | DX / calidad | Sí pero permisivo al inicio (B) |
| D-012 | Notificador de deploys (acoplado a market-tracker) | Independización | Reemplazar por webhook genérico (A) |
| D-013 | Migraciones en CI/CD | Operaciones | Mantener manual con script asistido (A) |
| D-014 | Backups automatizados ahora o post-launch | Operaciones | Ahora (A) — barato y crítico |
| D-015 | Tamaño de dataset por usuario | Offline | Capear a 50k trades iniciales (A) |
| D-016 | Imágenes privadas vs públicas-por-URL | Security 7 | Aceptar modelo actual + documentar (C) |
| D-017 | Token en localStorage vs httpOnly cookie | Security 8 | Migrar a cookie cuando entren externos (B) |

---

## D-001: Multi-tenant duro o blando

**Contexto**: hoy todos los usuarios comparten la misma base de datos y las mismas tablas (`trades`, `notes`, ...) con discriminación por `user_id`. Esto es multi-tenant **blando** (shared schema).

**Opciones**:

- **A) Mantener shared schema** — `user_id` como columna en cada tabla, filtros en cada query.
  - **Pro**: simple operativamente, un solo backup, migraciones únicas, joins eficientes.
  - **Con**: un bug en una query (`WHERE user_id` olvidado) leak data entre usuarios.

- **B) Schema por usuario** (`tradelog_user_1.trades`, `tradelog_user_2.trades`, ...).
  - **Pro**: aislamiento físico, performance independiente, backups granulares.
  - **Con**: complejidad operativa enorme (cada user → migración propia). Mal fit para Postgres a escala media.

- **C) Database por usuario / tenant**.
  - **Pro**: máximo aislamiento.
  - **Con**: imposible con presupuesto bajo, multiplica costos.

**Implicaciones**:
- Backups: A = un dump único. B/C = un dump por usuario.
- Migraciones: A = una migración. B = repetir por schema.
- Performance: A = una BD, queries comparten cache. B/C = aisladas, no comparten.

**Recomendación tentativa**: **A**. Para 100-1000 usuarios el shared schema con buenos tests y políticas RLS (Row-Level Security en Postgres si se quiere endurecer) es suficiente. Reconsiderar solo si entra cliente enterprise con requerimiento de aislamiento físico.

---

## D-002: Registro abierto vs whitelist

**Contexto**: hoy `POST /api/auth/google` acepta cualquier email de Google y crea el usuario en `users` automáticamente. No hay invitación previa, no hay validación de email permitido.

**Opciones**:

- **A) Registro abierto** — cualquiera con Google puede entrar.
- **B) Whitelist** — solo emails pre-aprobados (lista en BD o env `ALLOWED_EMAILS`).
- **C) Invitación por enlace** — admin genera links únicos que crean al user al loguear.

**Implicaciones**:
- A = más usuarios, más riesgo de abuso, más costos de hosting.
- B = control total, fricción para nuevos usuarios.
- C = balance, requiere UI de gestión de invitaciones (parte de spec `sistema-de-gestion-de-usuarios.md`).

**Recomendación tentativa**: **B** al lanzamiento (cerrado a un grupo conocido), evolucionar a **C** después. **A** solo si la app va a ser totalmente pública con freemium definido.

---

## D-003: Stats — duplicar lógica en cliente o endpoint "raw trades + computa todo en cliente"

**Contexto**: con la estrategia offline-first (Capa 3 de [`analysis/offline-strategy.md`](analysis/offline-strategy.md)), las stats agregadas se vuelven aritmética en cliente. Pregunta: ¿mantenemos los endpoints `/api/stats/*` (con su lógica SQL duplicada en JS), o los eliminamos y dejamos un único `/api/trades?include=closed` que el cliente reduce?

**Opciones**:

- **A) Mantener endpoints + duplicar lógica en cliente** — paridad mediante tests.
- **B) Eliminar endpoints, dejar solo `/api/trades`** — toda la agregación en cliente.
- **C) Híbrido**: stats globales del usuario via endpoint server-side cacheado; filtros y agregaciones detalladas en cliente.

**Implicaciones**:
- A = backwards-compat, integraciones externas (futuras) pueden usar los endpoints. Mantenimiento doble.
- B = simplicidad, una sola fuente de verdad (BD). Pero clientes "ligeros" (apps móviles, scripts) no pueden pedir stats sin descargar todo.
- C = mejor de ambos. Más complejidad al inicio.

**Recomendación tentativa**: **A** durante Capa 3 (tests aseguran paridad), considerar **C** si aparece un client externo que necesite stats sin descargar trades.

---

## D-004: Notas online-only u offline-first

**Contexto**: el modelo de notas es complejo (jerarquía, bloques tipados, fractional indexing, FTS, DnD optimístico). Hacerlo offline-first es factible pero costoso.

**Opciones**:

- **A) Online-only** — notas requieren conexión. Si offline, modo "lectura solamente" con cache de TanStack.
- **B) Offline-first completo** — sync bidireccional de notas y bloques. Requiere CRDTs o resolución manual de conflictos.

**Implicaciones**:
- A = ahorro masivo de complejidad. El usuario pierde la habilidad de tomar notas sin red.
- B = experiencia "Notion-like" verdadera. Costo: meses de ingeniería + bugs sutiles.

**Recomendación tentativa**: **A** en primera iteración. Notas son la feature más nueva y menos estable — agregar sync sobre algo todavía en evolución es invitar al caos. Reconsiderar si los usuarios piden insistentemente notas offline.

---

## D-005: Storage de imágenes — local + CDN vs object storage

**Contexto**: ver [`analysis/scaling.md` Fase 3](analysis/scaling.md#fase-3--almacenamiento-de-imágenes).

**Opciones**:

- **A) Disco local + Cloudflare CDN gratis** — más simple, USD 0.
- **B) Object storage S3-compatible** (Backblaze B2 / Cloudflare R2) — escalable, USD 0-5/mes.

**Recomendación tentativa**: **A** mientras el bucket de uploads esté <1 GB. Migrar a **B** si crece más, o si la VPS cambia (B desacopla el storage del compute).

---

## D-006: JWT revocation

**Contexto**: hoy logout no invalida el token. Ver `analysis/security.md` gap 6.

**Opciones**:

- **A) Tabla `jwt_revocations` en Postgres** con `jti`, consultada en `authenticate` con cache LRU local.
- **B) `users.session_version` (int)** — bump en logout o cambio de seguridad invalida todos los tokens del usuario.
- **C) Aceptar limitación** — tokens duran 7d, no se revocan, logout solo limpia el cliente.

**Implicaciones**:
- A = revocación granular (por sesión / dispositivo). +1 query por request (mitigable con cache).
- B = revocación masiva (todos los devices del user a la vez). +1 query por request a `users`.
- C = riesgo de tokens robados, no recovery.

**Recomendación tentativa**: **A**. La granularidad importa si el usuario tiene múltiples dispositivos y quiere "cerrar sesión en ese teléfono que perdí".

---

## D-007: Modelo de pricing / monetización

**Contexto**: ¿es la app free para todos? ¿freemium? ¿pago? Esto define rate limits, cuotas por usuario, qué features son premium.

**Opciones**:

- **A) Free total** — sostenida por el bolsillo del dueño. Sin limites mayores.
- **B) Freemium**: free hasta N trades / N imágenes / sin export PDF. Tier de pago levanta límites.
- **C) Suscripción**: solo paga, free trial.
- **D) Donaciones / open source**: gratis, banner de "buy me a coffee".

**Implicaciones críticas**:
- Define **cuotas técnicas**: si es free, agresivo con rate limits. Si pago, generoso.
- Define **storage policy**: free → eliminar imágenes después de X meses; pago → indefinido.
- Define **observabilidad**: pago = SLA serio = monitoring serio.

**Recomendación tentativa**: depende de la audiencia (el dueño). Si es uso personal + amigos: A. Si es producto: B o C.

---

## D-008: Postgres compartido con `market-tracker` o aislado

**Contexto**: hoy en prod tradelog y market-tracker comparten el contenedor `market-tracker-postgres-1`, en bases separadas (`tradelog`, `market_tracker_*`).

**Opciones**:

- **A) Mantener compartido** — un solo Postgres, dos bases, una sola operación.
- **B) Aislar** — Postgres dedicado a tradelog en otro contenedor o VPS.

**Implicaciones**:
- A = USD 0 extra, backup conjunto, una sola optimización.
- B = aislamiento de carga (un proyecto loco no impacta al otro), pero +RAM en VPS.

**Recomendación tentativa**: **A** hasta que tradelog crezca lo suficiente como para necesitar tuning de Postgres independiente.

---

## D-009: SLA pretendido

**Contexto**: ¿qué confiabilidad prometemos al usuario? Esto define cuánto invertir en observabilidad y redundancia.

**Opciones**:

- **A) "Best effort"** — sin SLA. Caída de unas horas es aceptable.
- **B) 99% uptime** — ~7h de downtime por mes permitidos. Requiere monitoreo activo y respuesta humana.
- **C) 99.9% uptime** — ~43min/mes. Requiere alertas 24/7 y procesos formales.

**Implicaciones**:
- A = UptimeRobot + alertas a email. USD 0.
- B = idem A + on-call informal.
- C = PagerDuty u OpsGenie, alertas en celular, runbooks formales, USD 50+/mes.

**Recomendación tentativa**: **A** al inicio. Subir a B si la app gana tracción.

---

## D-010: IDs SERIAL vs UUID client-generated

**Contexto**: hoy los `id` son `SERIAL` (autoincremental en Postgres). La Capa 4 de offline-first (sync de creación) requiere que el cliente pueda referenciar un trade recién creado sin esperar al server — eso requiere UUIDs generados localmente.

**Opciones**:

- **A) Migrar a UUID v4 como PK** — ruptura mayor. Todas las FKs deben migrar.
- **B) Mantener SERIAL como PK + agregar `uuid UUID UNIQUE` redundante** — frontend usa uuid, backend traduce.
- **C) Postergar** — no implementar Capa 4 hasta tener un caso de uso real que lo justifique.

**Implicaciones**:
- A = un mes de trabajo, riesgo de bugs en migración.
- B = +8 bytes por fila, complejidad menor.
- C = no se hace ahora.

**Recomendación tentativa**: **C** hasta que un usuario real diga "quiero crear trades sin internet". Hasta entonces, Capas 1-3 de offline ya dan el 80%.

---

## D-011: Tests bloqueantes en CI

**Contexto**: hoy el CI/CD solo despliega — no corre tests ni lint.

**Opciones**:

- **A) No agregar nada** — confiar en lint/tests local.
- **B) Job de CI que corre tests + lint, no bloquea merge** — marca falla pero permite seguir.
- **C) Job que bloquea merge si tests/lint rojos**.

**Implicaciones**:
- A = ágil pero riesgoso.
- B = visibilidad sin fricción.
- C = calidad asegurada, fricción.

**Recomendación tentativa**: **B** al inicio (mientras la cobertura es baja), escalar a **C** cuando los tests cubran lo crítico.

---

## D-012: Notificador de deploys acoplado a market-tracker

**Contexto**: el workflow de CI llama a `http://localhost:3001/api/send-alert` que es un endpoint del proyecto market-tracker. Si tradelog se publica como producto independiente, este coupling es problemático.

**Opciones**:

- **A) Webhook genérico** — usar Discord/Slack/Telegram directamente vía URL configurable. Secret en GitHub Actions.
- **B) Email** vía SMTP simple.
- **C) Dejar como está** mientras market-tracker viva en la misma VPS.

**Recomendación tentativa**: **A**, prepara el camino para independizar tradelog.

---

## D-013: Aplicar migraciones en CI/CD

**Contexto**: hoy las migraciones SQL se aplican a mano en la VPS tras `git pull`. Si una migración no se aplica, el backend rompe en runtime.

**Opciones**:

- **A) Mantener manual + script asistido** — `scripts/apply-migrations.sh` que detecta `0NN_*.sql` nuevos y los aplica con backup previo.
- **B) Auto-aplicar en cada deploy** — el job de CI ejecuta migrations. Riesgo: rollback complicado.
- **C) Framework de migraciones** (Knex, node-pg-migrate) con `migrate up/down` proper.

**Recomendación tentativa**: **A** ahora. **C** si la frecuencia de migraciones crece (e.g. >1 por semana).

---

## D-014: Backups automatizados ahora o post-launch

**Contexto**: hoy no hay cron de backups. Si la BD se corrompe → pérdida total.

**Opciones**:

- **A) Implementar ya** — cron en VPS + B2 (5GB free). 2-4h de trabajo total.
- **B) Post-launch** — apostar a que nada se rompe mientras se sigue construyendo.

**Recomendación tentativa**: **A**. Costo nulo, beneficio infinito. No publicar sin esto.

---

## D-015: Tamaño de dataset por usuario

**Contexto**: la Capa 3 de offline (Dexie + Array.filter) funciona bien hasta ~50k trades en cliente. Más allá, hay que paginar el cache local también.

**Opciones**:

- **A) Capear a 50k trades / usuario** y devolver error si se intenta exceder.
- **B) No capear pero documentar** que el cliente se vuelve lento por encima de 50k.
- **C) Implementar paginación local** desde el inicio (más complejo).

**Recomendación tentativa**: **A**. Para uso humano normal 50k trades es muchísimo (mas de 100 trades/día durante un año). Si llega un caso real distinto, escalar.

---

## D-016: Imágenes — privadas o públicas-por-URL

**Contexto**: ver `analysis/security.md` gap 7.

**Opciones**:

- **A) Auth en `/api/images`** — fetch + blob + `URL.createObjectURL`. Complejo en `<img>`.
- **B) Signed URLs** con TTL.
- **C) Aceptar modelo actual** — UUID en filename, no se pueden enumerar, no son privadas si se comparten.

**Recomendación tentativa**: **C** + documentar al usuario. Si llega un caso de info sensible, evaluar B.

---

## D-017: Token en localStorage vs httpOnly cookie

**Contexto**: ver `analysis/security.md` gap 8.

**Opciones**:

- **A) Mantener localStorage** — simpler, vulnerable a XSS.
- **B) Migrar a httpOnly cookie + CSRF** — más seguro, +2-3 días de refactor.

**Recomendación tentativa**: **B** cuando entren los primeros usuarios externos. Para uso personal hoy, **A** es OK.

---

## Cómo registrar una decisión

Cuando se elige una opción, editar este documento así:

```
## D-001: ¿Multi-tenant duro o blando?

**Decisión** (2026-06-15): **A — Mantener shared schema**.
**Razón**: con <100 usuarios esperados en el primer año, complejidad de B/C no se justifica.
**Re-evaluar**: cuando lleguemos a 500 usuarios o un cliente pida aislamiento.

(opciones originales aquí, tachadas o resumidas)
```

Para historial, considerar moverlas a `docs/adr/0001-multi-tenancy.md` con el formato ADR completo.
