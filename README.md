# Notification Hub Backend

API centralizada de entrega de notificaciones. Enviá un solo mensaje a Telegram, Discord, Slack o Teams desde un único endpoint — el sistema maneja el enrutamiento, la entrega, los reintentos y las cuotas diarias por usuario.

## Stack

| Capa | Tecnología |
|---|---|
| Runtime | Node.js 24 |
| Lenguaje | TypeScript (strict, ESM, nodenext) |
| Framework | Express 5 |
| ORM | Prisma 7 (con `@prisma/adapter-pg`) |
| Base de datos | PostgreSQL 16 |
| Auth | JWT (jsonwebtoken) + bcrypt |
| Validación | Zod 4 |
| Documentación | OpenAPI 3.0.3 + Swagger UI |
| Testing | Vitest 4 + supertest |
| Contenedores | Docker Compose |

## Estructura del proyecto

```
src/
├── modules/
│   ├── identity/          # Registro, login, JWT, roles
│   ├── notifications/     # Mensajes + destinos de notificación
│   ├── delivery/          # Adaptadores de proveedores, ejecución, reintentos
│   ├── quota/             # Límite diario por usuario
│   ├── administration/    # Reportes y métricas de admin
│   └── shared/            # Config, cliente DB, manejo de errores
├── app.ts                 # Cableado de DI, registro de rutas
├── main.ts                # Punto de entrada
└── openapi.ts             # Documento OpenAPI 3.0.3
prisma/
├── schema.prisma          # Modelo de datos (10 tablas)
├── seed.ts                # Roles, usuario admin, proveedores
└── migrations/
tests/                     # 236 tests (unitarios + integración)
```

## Requisitos

- Docker con Docker Compose (recomendado — levanta el stack completo)
- **O** para desarrollo local: Node.js >= 22, npm, Docker (solo para PostgreSQL)

## Inicio rápido con Docker (recomendado)

### 1. Clonar y configurar

```bash
git clone <repo-url>
cd BackendChallenge_Notification-Hub
cp .env.example .env
```

Editá `.env` y poné un `JWT_SECRET` seguro.

### 2. Levantar el stack

```bash
docker compose up --build -d
```

Esto arranca PostgreSQL y la API. Esperá ~15 segundos a que pasen los health checks:

```bash
docker compose ps
```

El seed y las conexiones de proveedores se ejecutan automáticamente al iniciar — son idempotentes y seguros de re-ejecutar.

### 3. Abrir la documentación

Abrí [http://localhost:3000/docs](http://localhost:3000/docs) en tu navegador.

**Para detener:** `docker compose down`

## Inicio rápido Local

### 1. Clonar e instalar

```bash
git clone <repo-url>
cd BackendChallenge_Notification-Hub
npm install
```

### 2. Configurar entorno

```bash
cp .env.example .env
```

Editá `.env` y poné un `JWT_SECRET` seguro. La app **se niega a iniciar** si `JWT_SECRET` falta o está vacío.

Para integración con Telegram y Discord, completá tus credenciales reales:

```env
TELEGRAM_BOT_TOKEN="tu_bot_token"
DISCORD_WEBHOOK_URL="tu_webhook_url"
```

### 3. Iniciar PostgreSQL

```bash
docker compose up -d postgres
```

Esperá a que pase el health check (`docker compose ps` muestra `healthy`).

### 4. Ejecutar migraciones y seed

```bash
npm run db:migrate
npm run db:seed
```

El seed crea:
- Roles: `USER`, `ADMIN`
- Usuario admin: `admin` / `Admin123!`
- Proveedores: `telegram`, `discord`

### 5. Configurar conexiones de proveedores

```bash
npx tsx scripts/setup-provider-connections.ts
```

Esto lee `TELEGRAM_BOT_TOKEN` y `DISCORD_WEBHOOK_URL` de tu `.env` y crea las filas correspondientes en `provider_connections`.

### 6. Iniciar la API

```bash
npm run dev
```

El servidor escucha en `http://localhost:3000`.

## Variables de entorno

| Variable | Requerida | Valor por defecto | Descripción |
|---|---|---|---|
| `DATABASE_URL` | Sí | — | String de conexión a PostgreSQL |
| `JWT_SECRET` | Sí | — | Secreto para firmar JWTs (la app se niega a iniciar si falta) |
| `JWT_EXPIRES_IN` | No | `1d` | Expiración del JWT (ej. `1h`, `7d`) |
| `PORT` | No | `3000` | Puerto del servidor HTTP |
| `DAILY_MESSAGE_LIMIT` | No | `100` | Máximo de mensajes por usuario por día |
| `TELEGRAM_BOT_TOKEN` | No | — | Token de la API de Telegram Bot |
| `DISCORD_WEBHOOK_URL` | No | — | URL del webhook de Discord |

## Ejecutar tests

```bash
# Crear la base de datos de test (configuración única)
# Asegurate de que postgres esté corriendo, luego:
npx tsx scripts/migrate-test.ts

# Ejecutar todos los tests
npm test

# Modo watch
npm run test:watch

# Con cobertura
npm run test:coverage

# En Docker (completamente aislado)
npm run test:coverage:docker
```

La suite de tests usa una base de datos PostgreSQL separada (`notification_hub_test`). Cada test de integración limpia sus propios datos con `TRUNCATE ... RESTART IDENTITY CASCADE` atómico.

> **Usuarios de Docker:** los tests corren dentro del servicio `test-coverage` independientemente de si la API está corriendo via Docker o localmente. Usá `npm run test:coverage:docker`.

## Endpoints de la API

### Públicos

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/auth/register` | Registrar un nuevo usuario |
| `POST` | `/auth/login` | Iniciar sesión, devuelve JWT |

### Autenticados (requiere `Authorization: Bearer <token>`)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/me` | Información del usuario actual |
| `GET` | `/providers` | Listar proveedores activos |
| `GET` | `/notification-targets` | Listar tus destinos |
| `POST` | `/notification-targets` | Crear un destino |
| `PATCH` | `/notification-targets/:id` | Actualizar nombre/metadata del destino |
| `PATCH` | `/notification-targets/:id/activate` | Activar un destino |
| `PATCH` | `/notification-targets/:id/deactivate` | Desactivar un destino |
| `GET` | `/messages` | Listar tus mensajes (filtros: `status`, `provider`, `from`, `to`) |
| `POST` | `/messages` | Crear y despachar un mensaje |
| `GET` | `/messages/:id` | Obtener un mensaje específico |
| `GET` | `/rate-limit/me` | Reporte de tu cuota diaria |

### Admin (requiere rol `ADMIN`)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/admin/auth-check` | Verificar acceso de admin |
| `GET` | `/admin/provider-connections` | Listar todas las conexiones de proveedores |
| `GET` | `/admin/messages` | Listar todos los mensajes (filtros: `userId`, `status`, `provider`, `from`, `to`) |
| `GET` | `/admin/metrics` | Métricas de uso por usuario |

### Documentación de la API

- **Swagger UI:** `http://localhost:3000/docs`
- **OpenAPI JSON:** `http://localhost:3000/openapi.json`

## Usar Swagger

1. Iniciá el servidor: `npm run dev`
2. Abrí `http://localhost:3000/docs`
3. Clickeá **Authorize** y pegá tu JWT
4. Probá cualquier endpoint directamente desde el navegador

## Ejemplo: enviar un mensaje a Telegram y Discord

### Paso 1 — Registrarse e iniciar sesión

```bash
# Registrarse
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"demo","email":"demo@example.com","password":"Demo123!"}'

# Iniciar sesión (guardá el accessToken)
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"demo","password":"Demo123!"}'
```

### Paso 2 — Crear destinos de notificación

```bash
TOKEN="<tu-jwt>"

# Destino Telegram (chat ID)
curl -X POST http://localhost:3000/notification-targets \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"provider":"telegram","externalTargetId":"123456789","targetType":"chat"}'

# Destino Discord (webhook)
curl -X POST http://localhost:3000/notification-targets \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"provider":"discord","externalTargetId":"https://discord.com/api/webhooks/...","targetType":"webhook"}'
```

### Paso 3 — Enviar un mensaje

```bash
curl -X POST http://localhost:3000/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: my-unique-key-001" \
  -d '{
    "content": "¡Hola desde Notification Hub!",
    "destinations": [
      {"provider":"telegram","targetId":"<telegram-target-uuid>"},
      {"provider":"discord","targetId":"<discord-target-uuid>"}
    ]
  }'
```

La respuesta incluye el estado del mensaje y los resultados por entrega. Si una entrega falla temporalmente, el sistema reintenta hasta 3 veces con backoff exponencial (5 s → 10 s → 20 s).

## Funcionalidades clave

- **Multi-proveedor:** Telegram (Bot API) y Discord (Webhooks) implementados. Slack y Teams están modelados en el schema para uso futuro.
- **Idempotencia:** Pasá un header `Idempotency-Key` para reintentar requests de forma segura sin crear mensajes duplicados.
- **Rate limiting atómico:** Cuota diaria por usuario aplicada con una sola sentencia SQL dentro de la transacción de creación de mensaje.
- **Reintentos automáticos:** Las entregas fallidas se reintentan hasta 3 veces con backoff exponencial. Las entregas trabadas (processing > 60 s) se recuperan al iniciar.
- **Redacción de secretos:** Los tokens de proveedores nunca se almacenan en la base de datos. Las respuestas se redactan antes de persistir.
- **Reportes de admin:** Lista global de mensajes y métricas por usuario para operadores.
- **Cobertura de tests completa:** 236 tests (unitarios + integración con PostgreSQL real).

## Limitaciones conocidas

- **El scheduler de reintentos es in-process.** No sobrevive reinicios del proceso — las entregas en estado `processing` al momento de un crash se recuperan en el siguiente inicio (umbral de stale: 60 s). Para producción se recomienda una cola externa (BullMQ, RabbitMQ).
- **Sin escalado horizontal.** Múltiples instancias de la API competirían por los reintentos. El mecanismo `claimRetry` es atómico, pero el scheduler debería extraerse a un worker separado para despliegues en producción.
- **Slack y Teams** están definidos en el schema y la spec OpenAPI pero todavía no tienen implementaciones de adaptador.
- **Sin paginación** en `GET /messages` ni `GET /admin/messages`. Todos los resultados se devuelven en una sola respuesta.
- **El health check** (`GET /health`) no verifica conectividad con la base de datos.
- **Sin logging estructurado.** Usa `console.log` / `console.error`. Suficiente para desarrollo; se recomienda un logger como Pino o Winston para producción.
- **El rate limiting es por usuario, no por IP.** Los endpoints de auth (`/auth/login`) no tienen protección contra fuerza bruta.

## Alternar entre Docker y desarrollo local

La API en Docker y `npm run dev` local ambos usan el puerto `3000`. Son mutuamente excluyentes:

- **Docker:** `docker compose up --build -d` (la API corre en un contenedor)
- **Local:** `docker compose up -d postgres` y después `npm run dev` (la API corre en el host)

Para cambiar de Docker a local: primero `docker compose stop api`.

## Comandos útiles

```bash
npm run dev                  # Iniciar con hot reload
npm run start                # Iniciar sin hot reload
npm test                     # Ejecutar todos los tests
npm run test:watch           # Modo watch
npm run test:coverage        # Con reporte de cobertura
npm run typecheck            # Verificación de TypeScript (sin emitir)
npm run db:generate          # Regenerar cliente de Prisma
npm run db:migrate           # Ejecutar migraciones (dev)
npm run db:seed              # Sembrar la base de datos
npm run db:studio            # Abrir Prisma Studio
npm run db:validate          # Validar schema
npm run db:migrate:test      # Migrar base de datos de test
docker compose up -d postgres  # Iniciar PostgreSQL
docker compose down            # Detener contenedores
docker compose up --build -d   # Iniciar PostgreSQL + API
docker compose logs -f api     # Seguir logs de la API
docker compose exec api npm run db:seed                              # Re-seed (idempotente, se ejecuta automáticamente al iniciar)
docker compose exec api npx tsx scripts/setup-provider-connections.ts # Re-configurar proveedores (idempotente, automático al iniciar)
```
