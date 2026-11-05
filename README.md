# Acompañamiento escolar

Aplicación escolar en español: React 18 + Vite en `frontend/`, API Express + Prisma en `backend/` y PostgreSQL 16. El repositorio es un workspace de pnpm con frontend y backend ejecutables por separado.

## Requisitos

- Node.js compatible con pnpm 12.
- pnpm 12.15.0 (`corepack enable` y `corepack prepare pnpm@12.15.0 --activate`).
- Docker Desktop para PostgreSQL local.
- FFmpeg instalado en el servidor solo para generar videos MP4.

## Configuración local

1. Copia `backend/.env.example` a `backend/.env` y configura PostgreSQL y dos secretos JWT distintos de al menos 32 caracteres.
2. Desde la raíz ejecuta `pnpm install`.
3. Inicia PostgreSQL con `docker compose up -d postgres`.
4. Aplica las migraciones con `pnpm db:migrate`.
5. Inicia ambos proyectos con `pnpm dev`, o por separado con `pnpm dev:backend` y `pnpm dev:frontend`.
6. Abre `http://localhost:5173`. La API queda disponible en `http://localhost:3001`.

El cliente no contiene claves de proveedores. Las variables privadas se configuran únicamente en `backend/.env`.

### Crear la base desde pgAdmin

La base de datos no es un archivo dentro del proyecto: vive en el servidor PostgreSQL local. `docker-compose.yml` inicia el servicio y conserva sus datos en el volumen Docker `pgdata`; el esquema (tablas, relaciones e índices) está definido en `backend/prisma/schema.prisma` y sus migraciones en `backend/prisma/migrations/`.

Para usar PostgreSQL instalado en Windows con pgAdmin:

1. En pgAdmin, conéctate al servidor local y crea una base vacía llamada `aischool`.
2. En `backend/.env`, configura `DATABASE_URL` así y reemplaza `PON_TU_CONTRASENA` por la contraseña del usuario con el que entras a pgAdmin:

   ```env
   DATABASE_URL="postgresql://postgres:PON_TU_CONTRASENA@localhost:5432/aischool?schema=public"
   ```

   Si la contraseña contiene caracteres como `@`, `:`, `/`, `#` o espacios, codifícalos para URL (por ejemplo, `@` se escribe `%40`). No compartas la contraseña. No reutilices la base `sistema_usuario` de otro proyecto.
3. **Opción recomendada:** desde la raíz ejecuta `pnpm db:migrate`. Prisma creará el esquema y registrará sus migraciones.
4. **Alternativa manual:** abre `backend/src/db/base_de_datos.sql` en Query Tool conectado a la base vacía `aischool` y ejecuta el script completo. Para que Prisma reconozca después el esquema ya creado, ejecuta desde la raíz:

   ```powershell
   pnpm --filter @aischool/backend exec prisma migrate resolve --applied 20261104112400_init
   pnpm --filter @aischool/backend exec prisma migrate resolve --applied 20261104120500_student_practice
   pnpm --filter @aischool/backend exec prisma migrate resolve --applied 20261104150000_student_tutor
   pnpm --filter @aischool/backend exec prisma migrate resolve --applied 20261105120000_phase4_services
   ```

   No ejecutes el SQL manual y `pnpm db:migrate` sobre el mismo esquema sin registrar primero el baseline, porque las tablas ya existirían.

## Servicios opcionales de Fase 4

- **IA:** configura `GEMINI_API_KEY`. `AI_DAILY_LIMIT=5` aplica una cuota móvil y compartida por alumno entre tutor, resúmenes, práctica, audio y video. El acceso a Gemini sin clave devuelve un error explícito.
- **Correo:** configura `SMTP_HOST`, `SMTP_FROM` y, si el servidor los exige, `SMTP_USER` y `SMTP_PASS`. Los enlaces de restablecimiento vencen en 30 minutos, son de un solo uso y no revelan si un correo está registrado.
- **Archivos:** el desarrollo usa `STORAGE_PROVIDER=local` y guarda adjuntos/materiales fuera de `frontend/public`. Para despliegue, configura un bucket S3-compatible privado, `STORAGE_PROVIDER=s3` y sus credenciales en el backend. No hagas público el bucket.
- **Migración de adjuntos:** configura S3 y ejecuta `pnpm --filter @aischool/backend uploads:migrate-to-s3` para copiar los adjuntos existentes. Comprueba los archivos copiados; solo añade `-- --delete-local` cuando quieras borrar las copias locales.
- **Videos:** configura `FFMPEG_PATH` si FFmpeg no está en el `PATH`. `VIDEO_FONT_PATH` permite indicar el archivo de fuente TrueType. FFmpeg se instala aparte; el proyecto no descarga ni distribuye binarios.

Adjuntos PDF e imágenes JPG/PNG/WebP tienen un límite de 10 MB y se validan por firma binaria. Lectura, audio y video se sirven mediante rutas autenticadas y con caché privada. La eliminación de la cuenta familiar elimina datos relacionales y pone los archivos en una cola de borrado reintentada por el backend.

Si SMTP no está configurado, la solicitud de restablecimiento devuelve `503 EMAIL_NOT_CONFIGURED` para cualquier correo y no crea ni simula un envío.

## Estructura

```text
AIschool/
├── backend/
│   ├── prisma/
│   ├── src/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── modules/
│   │   └── services/
│   └── tests/
├── frontend/
│   └── src/
├── docker-compose.yml
├── package.json
└── pnpm-workspace.yaml
```

Routers y controllers Express organizan la API; el frontend se puede iniciar de forma independiente para revisar las vistas. También puedes probar los endpoints autenticados con Postman usando cookies.

## Fases implementadas

- **Fase 0:** registro, inicio/cierre de sesión, rotación de refresh, recuperación de contraseña y esquema relacional.
- **Fase 1:** panel familiar para hijos, materias, horarios, tareas, adjuntos, evaluaciones y preferencias.
- **Fase 2:** acceso del alumno, tareas del día, horario, prácticas y resultados.
- **Fase 3:** tutor escolar paso a paso con Gemini y conversaciones privadas con retención limitada.
- **Fase 4:** almacenamiento local/S3 privado, copia de adjuntos a S3, cuota compartida de IA, resúmenes y prácticas generadas, podcasts narrados, videos didácticos MP4, restablecimiento de contraseña y eliminación de cuenta/archivos.

La voz del resumen diario del panel sigue siendo local al navegador. Los recursos generados mediante IA sí se envían a Google Gemini desde el servidor; el nombre, correo e identificadores del alumno no se incluyen en el prompt.

## Pruebas

Ejecuta `pnpm --filter @aischool/backend test`. Por defecto, las pruebas derivan la conexión desde `DATABASE_URL` y usan una base separada llamada `aischool_test`; el usuario configurado debe poder crear esa base. Para usar otro usuario de pruebas o un administrador distinto, configura `TEST_DATABASE_URL` y/o `TEST_ADMIN_DATABASE_URL` en `backend/.env`.
