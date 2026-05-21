# PRD - Notification Hub Backend

## 1. Descripción general

Notification Hub es una API REST backend que permite a usuarios registrados enviar mensajes y notificaciones a múltiples plataformas de comunicación desde un único punto centralizado.

El sistema debe permitir que un usuario autenticado envíe un mismo mensaje a distintos servicios externos, como Telegram, Discord, Slack o Microsoft Teams. Para esta primera versión se implementarán Telegram y Discord como proveedores iniciales.

El backend debe gestionar usuarios, autenticación, roles, persistencia de mensajes, integración con proveedores externos, control de límite diario de envíos, consultas, métricas administrativas, documentación OpenAPI y pruebas automatizadas.

## 2. Objetivo del proyecto

El objetivo principal es construir un backend confiable, mantenible y escalable que permita:

- Registrar usuarios.
- Autenticar usuarios mediante JWT.
- Diferenciar permisos entre usuarios comunes y administradores.
- Enviar mensajes a múltiples plataformas desde un único endpoint.
- Persistir mensajes y resultados de entrega.
- Controlar el límite diario de mensajes por usuario.
- Consultar mensajes enviados.
- Exponer métricas administrativas.
- Documentar los endpoints mediante OpenAPI/Swagger.
- Incluir pruebas unitarias sobre la lógica principal.

## 3. Alcance funcional

### 3.1 Funcionalidades obligatorias

El sistema debe implementar las siguientes funcionalidades:

#### Autenticación y usuarios

- Registro de usuarios con username, email y password.
- Hash seguro de contraseñas.
- Login mediante username/email y password.
- Generación de JWT.
- Protección de rutas privadas mediante JWT.
- Rol `USER` asignado por defecto a nuevos usuarios.
- Existencia de un usuario `ADMIN` inicial creado por seed.

#### Roles

El sistema debe contemplar al menos dos roles:

- `USER`: usuario estándar del sistema.
- `ADMIN`: usuario con acceso a consultas globales y métricas.

#### Envío de mensajes

- Un usuario autenticado debe poder enviar un mensaje a uno o más destinos.
- El endpoint de envío debe aceptar:
  - Contenido del mensaje.
  - Lista de destinos.
- El mensaje debe enviarse en nombre del usuario solicitante.
- El sistema debe persistir el mensaje original.
- El sistema debe persistir cada entrega individual por proveedor/destino.
- El sistema debe guardar la respuesta exitosa o el error devuelto por cada proveedor.

#### Proveedores externos

La primera versión implementará dos proveedores:

- Telegram.
- Discord.

El diseño debe permitir agregar otros proveedores en el futuro, como Slack o Microsoft Teams, sin modificar el núcleo del sistema.

#### Persistencia

Por cada mensaje enviado se debe guardar como mínimo:

- Usuario que lo envió.
- Contenido del mensaje.
- Fecha y hora de creación.
- Servicios/destinos objetivo.
- Estado general del mensaje.
- Estado individual de cada entrega.
- Respuesta del proveedor o error correspondiente.

#### Rate limiting

- Cada usuario debe tener un límite diario de mensajes.
- El límite inicial será de 100 mensajes por día.
- Si el usuario supera el límite, la API debe responder con un error adecuado.
- El sistema debe poder informar cuántos mensajes restantes tiene el usuario durante el día actual.

### 3.2 Funcionalidades deseadas

#### Consultas de usuario

Un usuario con rol `USER` debe poder listar sus propios mensajes aplicando filtros por:

- Estado del mensaje.
- Proveedor.
- Rango de fechas.

#### Consultas administrativas

Un usuario con rol `ADMIN` debe poder:

- Listar todos los mensajes del sistema.
- Filtrar mensajes por usuario, estado, proveedor y fecha.
- Acceder a métricas por usuario.

#### Métricas administrativas

El endpoint de métricas debe mostrar, por cada usuario:

- Total de mensajes enviados.
- Cantidad de mensajes enviados durante el día actual.
- Cantidad restante de mensajes permitidos durante el día actual.
- Límite diario configurado.

## 4. Fuera de alcance para la primera versión

Las siguientes funcionalidades quedan fuera del alcance inicial:

- Frontend web.
- Panel administrativo visual.
- Gestión multi-tenant por organizaciones.
- OAuth por usuario contra Slack, Discord, Telegram o Teams.
- Configuración dinámica de proveedores desde UI.
- Reintentos automáticos mediante workers externos.
- Sistema de colas avanzado.
- Notificaciones programadas.
- Webhooks entrantes.
- Plantillas de mensajes.
- Adjuntos o archivos multimedia.
- Sistema de billing o planes pagos.
- Auditoría avanzada orientada a compliance.

Algunas de estas funcionalidades pueden considerarse extensiones futuras.

## 5. Usuarios objetivo

### Usuario común

Perfil que utiliza la API para enviar mensajes a destinos previamente configurados.

Puede:

- Registrarse.
- Iniciar sesión.
- Enviar mensajes.
- Consultar sus propios mensajes.
- Filtrar sus mensajes por estado, proveedor y fecha.

No puede:

- Ver mensajes de otros usuarios.
- Acceder a métricas globales.
- Administrar datos de otros usuarios.

### Usuario administrador

Perfil con permisos ampliados para supervisar el sistema.

Puede:

- Iniciar sesión.
- Consultar todos los mensajes.
- Acceder a métricas globales.
- Ver el consumo diario por usuario.
- Consultar el estado general del sistema.

## 6. Reglas de negocio

### RN-01 - Registro de usuario

Todo usuario nuevo debe registrarse con username, email y password.

El sistema debe validar:

- Username obligatorio.
- Password obligatorio.
- Username único.
- Email único si se informa.
- Password almacenada como hash, nunca en texto plano.

Al crear un usuario, el sistema debe asignarle automáticamente el rol `USER`.

### RN-02 - Usuario administrador inicial

El sistema debe crear mediante seed al menos un usuario administrador inicial.

Credenciales iniciales de desarrollo:

- Username: `admin`
- Password: `Admin123!`
- Rol: `ADMIN`

Estas credenciales deben considerarse únicamente para desarrollo y deben poder modificarse mediante variables de entorno o configuración segura en ambientes reales.

### RN-03 - Login

El login debe validar las credenciales del usuario.

Si las credenciales son correctas, el sistema debe devolver un JWT.

Si las credenciales son incorrectas, el sistema debe devolver un error de autenticación sin revelar si el username/email existe o no.

### RN-04 - Protección de rutas

Toda ruta que permita enviar mensajes o consultar información privada debe requerir JWT válido.

Las rutas administrativas deben requerir además rol `ADMIN`.

### RN-05 - Envío de mensajes

Un usuario autenticado puede enviar un mensaje a múltiples destinos desde un único endpoint.

El sistema debe:

1. Validar el JWT.
2. Identificar al usuario.
3. Validar el contenido del mensaje.
4. Validar los destinos.
5. Verificar el límite diario del usuario.
6. Crear el registro principal del mensaje.
7. Crear una entrega individual por cada destino.
8. Invocar el proveedor correspondiente.
9. Guardar la respuesta o error de cada proveedor.
10. Actualizar el estado de cada entrega.
11. Calcular el estado final del mensaje.
12. Actualizar el consumo diario del usuario.

### RN-06 - Estados de mensaje

El mensaje general puede tener los siguientes estados:

- `pending`: mensaje creado, aún no procesado completamente.
- `success`: todas las entregas fueron exitosas.
- `partial`: algunas entregas fueron exitosas y otras fallaron.
- `failed`: todas las entregas fallaron.
- `cancelled`: mensaje cancelado o invalidado.

### RN-07 - Estados de entrega

Cada entrega individual puede tener los siguientes estados:

- `pending`: entrega creada, aún no procesada.
- `processing`: entrega en proceso.
- `success`: entrega exitosa.
- `failed`: entrega fallida.
- `retrying`: entrega pendiente de reintento.
- `cancelled`: entrega cancelada.

### RN-08 - Resultado parcial

Si un mensaje se envía a más de un destino y al menos una entrega falla mientras otra resulta exitosa, el estado general del mensaje debe ser `partial`.

Ejemplo:

- Telegram: `success`
- Discord: `failed`
- Mensaje general: `partial`

### RN-09 - Rate limiting diario

Cada usuario tiene un límite diario de mensajes.

Valor inicial:

- 100 mensajes por día.

El contador debe evaluarse por usuario y por fecha.

Si el usuario supera el límite, el sistema debe responder con error HTTP `429 Too Many Requests`.

### RN-10 - Idempotencia

El sistema debe contemplar una clave de idempotencia opcional para evitar envíos duplicados.

Si el cliente envía una misma `idempotencyKey` para el mismo usuario, el sistema debe evitar duplicar el mensaje.

Esta funcionalidad puede implementarse en una etapa posterior, pero el modelo de datos ya debe soportarla.

## 7. Modelo de datos

La base de datos se implementará con PostgreSQL y Prisma ORM.

### 7.1 Tablas principales

#### users

Almacena usuarios del sistema.

Campos principales:

- `id`
- `username`
- `email`
- `password_hash`
- `is_active`
- `created_at`
- `updated_at`
- `last_login_at`

#### roles

Almacena roles del sistema.

Valores iniciales:

- `USER`
- `ADMIN`

#### user_roles

Tabla intermedia entre usuarios y roles.

Permite que un usuario tenga uno o más roles.

#### providers

Almacena proveedores de comunicación soportados.

Valores iniciales:

- `telegram`
- `discord`

Valores previstos:

- `slack`
- `teams`

#### provider_connections

Representa configuraciones técnicas para conectarse con proveedores externos.

Ejemplos:

- Bot token de Telegram.
- Webhook de Discord.
- Bot token de Slack.
- Connector de Teams.

No se recomienda almacenar secretos sensibles directamente en texto plano. Deben guardarse referencias a variables de entorno o servicios de secretos.

#### notification_targets

Representa destinos concretos de envío.

Ejemplos:

- Chat de Telegram.
- Canal de Discord.
- Webhook de Discord.
- Canal de Slack.
- Connector de Teams.

#### messages

Representa el mensaje lógico creado por un usuario.

Un registro en `messages` puede generar varias entregas individuales.

#### message_deliveries

Representa cada entrega individual de un mensaje hacia un destino específico.

Si un mensaje se envía a Telegram y Discord, se crean dos registros en esta tabla.

#### delivery_attempts

Representa cada intento técnico de envío.

Permite registrar:

- Número de intento.
- Estado.
- Código HTTP.
- Respuesta del proveedor.
- Error técnico.
- Fecha del intento.

#### daily_usage

Registra el consumo diario de mensajes por usuario.

Permite implementar el límite diario de envíos.

#### audit_logs

Registra eventos relevantes del sistema.

Ejemplos:

- Registro de usuario.
- Login.
- Creación de mensaje.
- Envío exitoso.
- Error de entrega.
- Consulta administrativa.

## 8. Arquitectura propuesta

La aplicación debe organizarse en módulos claros.

### 8.1 Módulos principales

#### Auth Module

Responsable de:

- Registro.
- Login.
- Hash de contraseña.
- Generación de JWT.
- Validación de JWT.
- Obtención del usuario autenticado.

#### Users Module

Responsable de:

- Consulta de usuarios.
- Asociación de roles.
- Creación de usuario con rol por defecto.
- Gestión del usuario administrador inicial mediante seed.

#### Providers Module

Responsable de:

- Consultar proveedores disponibles.
- Resolver qué adaptador corresponde usar.
- Encapsular la comunicación con Telegram y Discord.

#### Messages Module

Responsable de:

- Crear mensajes.
- Crear entregas individuales.
- Calcular estado global del mensaje.
- Consultar mensajes del usuario.
- Aplicar filtros.

#### Deliveries Module

Responsable de:

- Ejecutar entregas individuales.
- Registrar intentos.
- Guardar respuestas del proveedor.
- Guardar errores.
- Actualizar estado de entregas.

#### Rate Limit Module

Responsable de:

- Consultar uso diario.
- Validar límite diario.
- Incrementar contador de mensajes.
- Calcular mensajes restantes.

#### Admin Module

Responsable de:

- Listar mensajes globales.
- Consultar métricas por usuario.
- Aplicar filtros administrativos.

## 9. Stack tecnológico

### Backend

- Node.js.
- TypeScript.
- Framework sugerido: Express o NestJS.

### Base de datos

- PostgreSQL.
- Prisma ORM.
- Prisma Migrate.
- Prisma Seed.

### Infraestructura local

- Docker.
- Docker Compose.

### Seguridad

- JWT.
- Bcrypt para hash de contraseñas.
- Variables de entorno para secretos.

### Testing

- Jest o Vitest.
- Tests unitarios para lógica principal.
- Mocks para proveedores externos.

### Documentación

- OpenAPI.
- Swagger UI.

## 10. Estado actual del proyecto

El módulo de base de datos se encuentra implementado en su primera versión funcional.

Se completó:

- Configuración de PostgreSQL con Docker.
- Configuración de Prisma 7.
- Definición de `schema.prisma`.
- Configuración de `prisma.config.ts`.
- Migración inicial.
- Seed inicial.
- Creación de roles `USER` y `ADMIN`.
- Creación de usuario administrador inicial.
- Creación de providers `telegram` y `discord`.

## 11. Variables de entorno

El proyecto debe utilizar un archivo `.env`.

Variables mínimas:

env
DATABASE_URL="postgresql://notification_user:notification_password@localhost:5432/notification_hub_db?schema=public"
JWT_SECRET="change_me"
JWT_EXPIRES_IN="1d"
DAILY_MESSAGE_LIMIT="100"
TELEGRAM_BOT_TOKEN=""
DISCORD_WEBHOOK_URL=""

El archivo .env no debe subirse al repositorio.

Debe existir un archivo .env.example con las variables requeridas, sin secretos reales.

## 12. Endpoints previstos
### 12.1 Auth
POST /auth/register

Registra un nuevo usuario.

Request esperado:

{
  "username": "joaquin",
  "email": "joaquin@example.com",
  "password": "Password123!"
}

Respuesta esperada:

{
  "id": "uuid",
  "username": "joaquin",
  "email": "joaquin@example.com",
  "roles": ["USER"]
}
POST /auth/login

Autentica al usuario y devuelve un JWT.

Request esperado:

{
  "username": "joaquin",
  "password": "Password123!"
}

Respuesta esperada:

{
  "accessToken": "jwt_token",
  "tokenType": "Bearer"
}
### 12.2 Usuario autenticado
GET /me

Devuelve información del usuario autenticado.

Requiere JWT.

Respuesta esperada:

{
  "id": "uuid",
  "username": "joaquin",
  "email": "joaquin@example.com",
  "roles": ["USER"]
}
### 12.3 Mensajes
POST /messages

Envía un mensaje a múltiples destinos.

Requiere JWT.

Request esperado:

{
  "content": "Hola equipo",
  "destinations": [
    {
      "provider": "telegram",
      "targetId": "uuid-target-telegram"
    },
    {
      "provider": "discord",
      "targetId": "uuid-target-discord"
    }
  ]
}

Respuesta esperada:

{
  "messageId": "uuid",
  "status": "partial",
  "deliveries": [
    {
      "provider": "telegram",
      "status": "success"
    },
    {
      "provider": "discord",
      "status": "failed",
      "error": "Provider unavailable"
    }
  ]
}
GET /messages

Lista mensajes del usuario autenticado.

Requiere JWT.

Filtros opcionales:

status
provider
from
to

Ejemplo:

GET /messages?status=success&provider=telegram&from=2026-01-01&to=2026-01-31
GET /messages/:id

Devuelve el detalle de un mensaje propio.

Requiere JWT.

Un usuario común solo puede acceder a sus propios mensajes.

### 12.4 Providers
GET /providers

Lista proveedores activos.

Requiere JWT.

Respuesta esperada:

[
  {
    "code": "telegram",
    "name": "Telegram"
  },
  {
    "code": "discord",
    "name": "Discord"
  }
]
### 12.5 Admin
GET /admin/messages

Lista todos los mensajes del sistema.

Requiere JWT con rol ADMIN.

Filtros opcionales:

userId
status
provider
from
to
GET /admin/metrics

Devuelve métricas por usuario.

Requiere JWT con rol ADMIN.

Respuesta esperada:

[
  {
    "userId": "uuid",
    "username": "joaquin",
    "totalMessagesSent": 120,
    "sentToday": 10,
    "dailyLimit": 100,
    "remainingToday": 90
  }
]
## 13. Códigos de respuesta esperados
Respuestas exitosas
200 OK: operación exitosa.
201 Created: recurso creado correctamente.
Errores de cliente
400 Bad Request: request inválido.
401 Unauthorized: usuario no autenticado o token inválido.
403 Forbidden: usuario sin permisos suficientes.
404 Not Found: recurso no encontrado.
409 Conflict: conflicto, por ejemplo username duplicado.
422 Unprocessable Entity: validación fallida.
429 Too Many Requests: límite diario excedido.
Errores de servidor
500 Internal Server Error: error interno no controlado.
502 Bad Gateway: error de proveedor externo.
503 Service Unavailable: proveedor externo no disponible.

## 14. Integración con proveedores
### 14.1 Telegram

Telegram se integrará mediante Telegram Bot API.

El sistema debe enviar mensajes utilizando un bot token configurado por variable de entorno o por referencia segura en provider_connections.

Datos necesarios:

Bot token.
Chat ID del destino.
14.2 Discord

Discord se integrará inicialmente mediante Webhooks.

Datos necesarios:

Webhook URL o identificador del webhook.
Payload con contenido del mensaje.
14.3 Firma del mensaje

Los mensajes enviados a proveedores externos deben indicar el usuario solicitante.

Ejemplo de contenido enviado:

[Notification Hub]
From: joaquin

Hola equipo

Esto permite cumplir con la regla de que el mensaje sea enviado en nombre del usuario que realizó la solicitud.

## 15. Testing

El proyecto debe incluir pruebas automatizadas sobre la lógica principal.

### 15.1 Tests mínimos
Auth
Registro exitoso.
Registro con username duplicado.
Login exitoso.
Login con password inválida.
Generación de JWT.
Protección de rutas privadas.
Roles
Usuario nuevo recibe rol USER.
Usuario sin rol ADMIN no puede acceder a endpoints administrativos.
Usuario ADMIN sí puede acceder a endpoints administrativos.
Messages
Envío de mensaje con un destino.
Envío de mensaje con múltiples destinos.
Persistencia del mensaje.
Persistencia de entregas individuales.
Cálculo de estado success.
Cálculo de estado failed.
Cálculo de estado partial.
Rate limiting
Usuario puede enviar si no supera el límite.
Usuario recibe error si supera el límite diario.
Cálculo correcto de mensajes restantes.
Providers
Telegram provider recibe payload correcto.
Discord provider recibe payload correcto.
Error de proveedor queda registrado correctamente.
Los proveedores externos deben mockearse en tests unitarios.
## 16. Criterios de aceptación

El proyecto se considera aceptado cuando cumple con los siguientes puntos:

La aplicación levanta correctamente en entorno local.
PostgreSQL se ejecuta mediante Docker Compose.
Prisma aplica migraciones correctamente.
El seed crea roles, usuario admin y providers iniciales.
Un usuario puede registrarse.
Un usuario puede iniciar sesión.
El login devuelve JWT.
Las rutas privadas rechazan requests sin JWT.
Un usuario autenticado puede enviar mensajes.
El mensaje se puede enviar a Telegram y Discord.
El sistema persiste el mensaje.
El sistema persiste cada entrega individual.
El sistema guarda errores de proveedor si ocurren.
El sistema aplica límite diario de mensajes.
El usuario puede consultar sus propios mensajes.
El admin puede consultar todos los mensajes.
El admin puede consultar métricas.
Existe documentación OpenAPI/Swagger.
Existen tests unitarios para la lógica principal.
El proyecto tiene README con instrucciones de instalación y ejecución.

## 17. Docker

El proyecto debe incluir un docker-compose.yml para levantar PostgreSQL localmente.

Servicio mínimo:

PostgreSQL 16.
Base de datos notification_hub_db.
Usuario notification_user.
Password notification_password.
Puerto expuesto 5432.

En una etapa posterior, puede agregarse Dockerfile para contenerizar también la API.

## 18. Documentación requerida

El repositorio debe incluir:

README.md

Debe explicar:

Qué hace el proyecto.
Stack tecnológico.
Cómo instalar dependencias.
Cómo configurar .env.
Cómo levantar PostgreSQL.
Cómo ejecutar migraciones.
Cómo ejecutar seed.
Cómo correr la API.
Cómo correr tests.
Endpoints principales.
Decisiones técnicas relevantes.
PRD.md

Documento de requisitos del producto.

OpenAPI/Swagger

La API debe exponer documentación interactiva para probar endpoints.

## 19. Plan de implementación
### Fase 1 - Base de datos

Estado: completada en primera versión.

Tareas:
Configurar Docker Compose con PostgreSQL.
Configurar Prisma.
Crear modelo de datos.
Ejecutar migración inicial.
Crear seed inicial.
Validar roles, admin y providers.

### Fase 2 - Autenticación

Tareas:
Configurar framework backend.
Crear estructura de carpetas.
Implementar registro.
Implementar login.
Implementar hash de password.
Implementar JWT.
Implementar middleware/guard de autenticación.
Implementar control de roles.
Crear endpoint /me.

### Fase 3 - Mensajes

Tareas:
Implementar endpoint POST /messages.
Validar contenido.
Validar destinos.
Crear mensaje principal.
Crear entregas individuales.
Calcular estado global.
Persistir resultados.

### Fase 4 - Providers

Tareas:
Crear interfaz común de provider.
Implementar Telegram provider.
Implementar Discord provider.
Manejar errores externos.
Registrar respuestas en delivery_attempts.

### Fase 5 - Rate limiting

Tareas:
Consultar uso diario.
Validar límite.
Incrementar contador.
Devolver error 429 cuando corresponda.
Exponer mensajes restantes.

### Fase 6 - Consultas

Tareas:
Implementar GET /messages.
Implementar filtros por estado.
Implementar filtros por proveedor.
Implementar filtros por fecha.
Implementar GET /messages/:id.

### Fase 7 - Admin

Tareas:
Implementar GET /admin/messages.
Implementar GET /admin/metrics.
Proteger rutas con rol ADMIN.

### Fase 8 - Testing

Tareas:
Configurar framework de testing.
Crear tests unitarios.
Mockear providers.
Testear auth, messages, rate limit y roles.

### Fase 9 - Documentación y entrega

Tareas:
Completar README.
Agregar Swagger/OpenAPI.
Documentar decisiones técnicas.
Agregar comandos de ejecución.
Preparar entrega final.

### Fase 10 - Extras

Tareas opcionales:
Dockerfile de la API.
CI/CD con GitHub Actions.
Deploy en Render, Fly.io, Heroku o Back4app.
Reintentos automáticos.
Auditoría más completa.
Idempotencia completa.

## 19_B. Plan de implementación actualizado

El desarrollo del proyecto se organiza en módulos funcionales. Si bien el PRD original planteaba fases generales, durante la implementación se adoptó una división modular para reducir riesgo técnico, facilitar validación incremental y mantener trazabilidad entre especificación, diseño, tareas, implementación y verificación.

### Módulo 1 - Base de datos y configuración inicial

Estado: completado.

Alcance:
- Configuración de Docker Compose con PostgreSQL.
- Configuración de Prisma.
- Definición del modelo de datos inicial.
- Migraciones.
- Seed inicial.
- Roles `USER` y `ADMIN`.
- Usuario administrador inicial.
- Providers iniciales `telegram` y `discord`.

### Módulo 2 - Autenticación y roles

Estado: completado.

Alcance:
- Registro de usuarios.
- Login.
- Hash de contraseñas.
- Generación de JWT.
- Middleware de autenticación.
- Middleware de autorización por rol.
- Endpoint `/me`.
- Validación de acceso a rutas protegidas.

### Módulo 3 - Message Management

Estado: completado en modalidad persistence-first.

Alcance:
- `POST /messages`.
- Validación de contenido.
- Validación de destinos.
- Creación de `Message`.
- Creación de `MessageDelivery` en estado `pending`.
- Idempotencia mediante `Idempotency-Key`.
- `GET /messages`.
- `GET /messages/:id`.
- Filtros por estado, provider y fechas.
- Scoping por usuario autenticado.

Fuera de este módulo:
- Ejecución real de providers.
- Creación de `DeliveryAttempt`.
- Cálculo final de estados `success`, `failed` y `partial`.

### Módulo 4 - Providers y Notification Targets Foundation

Estado: completado.

Alcance:
- `GET /providers`.
- Lectura segura de provider connections para administradores.
- `GET /notification-targets`.
- `POST /notification-targets`.
- `PATCH /notification-targets/:id`.
- Activación y desactivación de targets.
- Ownership de targets por usuario.
- Resolución interna de provider connection activa.
- Prevención de exposición de secretos.

Fuera de este módulo:
- Llamadas reales a Telegram o Discord.
- Webhooks.
- Delivery execution.
- Delivery attempts.

### Módulo 5 - Delivery Execution

Estado: completado.

Alcance previsto:
- Definir una interfaz común de providers.
- Implementar adapter de Telegram.
- Implementar adapter de Discord.
- Ejecutar entregas pendientes.
- Crear registros en `DeliveryAttempt`.
- Guardar respuesta exitosa o error de proveedor.
- Actualizar `MessageDelivery.status`.
- Calcular `Message.status` como `success`, `failed` o `partial`.

### Módulo 6 - Rate Limiting

Estado: pendiente.

Alcance previsto:
- Validar límite diario por usuario.
- Usar `DailyUsage`.
- Incrementar consumo diario.
- Devolver error `429 Too Many Requests` si se supera el límite.
- Calcular mensajes restantes del día.

### Módulo 7 - Admin Reporting

Estado: pendiente.

Alcance previsto:
- `GET /admin/messages`.
- Filtros por usuario, estado, provider y fecha.
- `GET /admin/metrics`.
- Total de mensajes enviados por usuario.
- Mensajes enviados durante el día actual.
- Límite diario.
- Mensajes restantes.

### Módulo 8 - Testing Hardening

Estado: parcial.

Alcance previsto:
- Mantener tests de integración existentes.
- Agregar tests unitarios para lógica principal.
- Mockear providers externos.
- Cubrir cálculo de estados.
- Cubrir rate limiting.
- Cubrir endpoints administrativos.

### Módulo 9 - Documentación y entrega

Estado: pendiente.

Alcance previsto:
- Completar README.
- Documentar variables de entorno.
- Documentar comandos de instalación, migración, seed, ejecución y testing.
- Agregar OpenAPI/Swagger.
- Documentar endpoints principales.
- Documentar decisiones técnicas relevantes.

### Módulo 10 - Extras opcionales

Estado: fuera de alcance inicial.

Alcance posible:
- Dockerfile de la API.
- CI/CD.
- Deploy.
- Reintentos automáticos.
- Auditoría avanzada.

## 20. Riesgos técnicos
### RT-01 - Complejidad de proveedores externos

Cada proveedor tiene reglas, formatos y errores diferentes.

Mitigación:

Crear adaptadores separados por proveedor.
Definir una interfaz común de envío.
Mockear proveedores en tests.

### RT-02 - Manejo incorrecto de estados parciales

Un mensaje puede ser exitoso en un proveedor y fallar en otro.

Mitigación:

Separar messages de message_deliveries.
Calcular estado global en función de entregas individuales.

### RT-03 - Exposición de secretos

Tokens y webhooks no deben quedar hardcodeados.

Mitigación:

Usar variables de entorno.
No subir .env.
Usar secretRef en base de datos.
Documentar .env.example.

### RT-04 - Rate limit inconsistente

El conteo diario puede fallar si hay concurrencia.

Mitigación:

Usar transacciones.
Usar restricción única por usuario y fecha.
Centralizar lógica de consumo diario.

### RT-05 - Dependencia de herramientas externas

Prisma Studio puede fallar en algunos entornos, especialmente con versiones recientes de Node.

Mitigación:

Validar datos también mediante seed, tests o cliente SQL.
No depender de Prisma Studio como única forma de verificación.

## 21. Decisiones técnicas
Separación entre Message y MessageDelivery

Se separa el mensaje lógico de las entregas individuales porque un mismo mensaje puede enviarse a múltiples destinos y cada destino puede tener un resultado diferente.

Esto permite representar correctamente casos como:

Todos los envíos exitosos.
Todos los envíos fallidos.
Envíos parcialmente exitosos.
Separación entre MessageDelivery y DeliveryAttempt

Se separa la entrega del intento porque una entrega puede requerir varios intentos.

Esto permite trazabilidad técnica, debugging y futuros reintentos automáticos.

Uso de Provider y NotificationTarget

Se separan proveedores y destinos para evitar hardcodear plataformas en la lógica principal.

Esto permite agregar nuevos proveedores o destinos sin rediseñar la base de datos.

Uso de Prisma

Prisma se utiliza como ORM para:

Definir modelos.
Generar migraciones.
Acceder a la base mediante cliente tipado.
Mantener consistencia entre TypeScript y PostgreSQL.
Uso de PostgreSQL

PostgreSQL se elige por ser una base relacional sólida, ampliamente utilizada, compatible con JSON y adecuada para modelar entidades, relaciones, filtros y métricas.

## 22. Convenciones del proyecto
Nombres
En TypeScript se usará camelCase.
En base de datos se usará snake_case.
Los modelos Prisma usarán nombres en singular.
Las tablas reales usarán nombres en plural.
Estados

Los estados se manejarán mediante enums.

Fechas

Todas las fechas deben guardarse en formato DateTime.

Para el rate limit diario, debe definirse una única regla de día aplicable. En esta primera versión se puede utilizar la fecha local del servidor o UTC, pero debe quedar documentado.

Errores

Los errores deben responder con estructura consistente:

{
  "error": "Error code",
  "message": "Human readable message",
  "details": {}
}

## 23. Entregables finales

La entrega final del challenge debe incluir:

Código fuente completo.
API funcional.
Base de datos con migraciones.
Seed inicial.
README.
PRD.
Documentación Swagger/OpenAPI.
Tests unitarios.
Docker Compose.
Variables de entorno documentadas.
Explicación de decisiones técnicas.
Opcionalmente Dockerfile, CI/CD y deploy.