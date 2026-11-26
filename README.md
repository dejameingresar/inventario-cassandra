# Inventario sobre Apache Cassandra (Astra DB)

Aplicación y API REST para gestión de inventario por categoría sobre **Apache Cassandra**, base de datos NoSQL de tipo columnar ampliamente usada en escenarios de alta escritura y disponibilidad.

Curso: **SI783 - Base de Datos II** — Actividad Grupal 01-U2
Integrantes: Rodriguez Cardenas, Patrick Elvis (2022075751) y Rios Cohaila, Nicole Luciana (2022075745)

## Arquitectura

- **API**: Node.js 20 + Express, driver oficial `cassandra-driver`.
- **Base de datos**: Apache Cassandra 5 (local vía Docker) o DataStax Astra DB (SaaS) en producción.
- **Modelado**: tabla `productos_por_categoria` con partition key `categoria` y clustering key `id` (UUID). El particionado por categoría evita escrituras dispersas y permite lecturas por partición sin `ALLOW FILTERING`.
- **Entrega**: imagen Docker multi-etapa, CI con Cassandra real en GitHub Actions, publicación de imagen en GHCR y despliegue por webhook.

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Verifica conexión a Cassandra |
| GET | `/productos/:categoria` | Lista productos de una partición |
| PUT | `/productos/:categoria/:id` | Inserta o actualiza (upsert) |
| DELETE | `/productos/:categoria/:id` | Elimina |

## Ejecución local

```bash
docker compose up -d cassandra
docker exec -i $(docker ps -qf name=cassandra) cqlsh < db/schema.cql
docker exec -i $(docker ps -qf name=cassandra) cqlsh < db/seed.cql
docker compose up api
curl http://localhost:3000/health
```

## Modo público (lo que necesitas hacer tú)

La API ya está preparada para los dos entornos: `src/db.js` decide entre el modo local, el de Astra DB y el almacén embebido, según qué variables existan. No hay que cambiar código. Desplegada en producción: https://inventario-cassandra.vercel.app

## Modo público (sin credenciales)

Si no hay `ASTRA_BUNDLE_PATH` ni `CASSANDRA_CONTACT_POINTS`, la API arranca con un almacén embebido sembrado con los productos de `db/seed.cql`. La URL pública funciona sin credenciales y `/health` responde `200` con `{"status":"ok","db":"memory"}`, para que quede claro que no está hablando con Cassandra. Las cuatro rutas (listar, upsert y borrar por categoría) funcionan igual; los cambios viven en la memoria del proceso y se pierden al reiniciar.

Para pasar el despliegue a Cassandra real, estos son los pasos:

1. Crear una base **Astra DB Serverless**, plan gratuito, en https://astra.datastax.com.
2. Descargar el *Secure Connect Bundle* (un `.zip`) de esa base.
3. Crear un token de aplicación: te da `Client ID` y `Client Secret` con permiso sobre el keyspace `inventario`.
4. Abrir el `CQL Console` de Astra y ejecutar el contenido de `db/schema.cql` (crea el keyspace y la tabla `productos_por_categoria`).
5. Configurar estas cuatro variables de entorno en el servicio donde corre la API:

```
ASTRA_BUNDLE_PATH=/secrets/secure-connect.zip
ASTRA_CLIENT_ID=<client_id>
ASTRA_CLIENT_SECRET=<secret>
ASTRA_KEYSPACE=inventario
```

El bundle `.zip` se sube como archivo secreto y se monta en esa ruta; en Vercel se pasa como `ASTRA_BUNDLE_BASE64` y `src/db.js` lo materializa en `/tmp`. Sin esas variables la API sigue funcionando en modo demostración con el almacén embebido; `/health` lo indica con `db: "memory"`.

6. Para que el despliegue sea automático, registrar el secreto `RENDER_DEPLOY_HOOK` en el repositorio. El workflow `deploy.yml` llama a ese hook; hoy, si no está, omite el paso y sale en verde sin desplegar.

Las credenciales no se pegan en el repositorio: se ponen directamente en el panel de Astra y en el panel del proveedor donde se publique la API.

## Despliegue automatizado

- `.github/workflows/ci.yml`: levanta Cassandra real, aplica el esquema y prueba la API.
- `.github/workflows/build-image.yml`: construye y publica la imagen en `ghcr.io`.
- `.github/workflows/deploy.yml`: dispara el despliegue en Render mediante `RENDER_DEPLOY_HOOK`; si el secreto no existe, omite el paso.

## Por qué Cassandra y no otra NoSQL

Cassandra ofrece escritura distribuida sin punto único de fallo, replicación multi-DC y un modelo columnar pensado para consultas por clave de partición. Es la elección natural cuando el volumen de escritura y la disponibilidad pesan más que la flexibilidad de esquema de un documento o la navegación de un grafo.
