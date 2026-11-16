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

## Producción (Astra DB)

1. Crear una base **Astra DB Serverless** (free tier) y descargar el *Secure Connect Bundle*.
2. Crear un rol/token con permiso sobre el keyspace `inventario`.
3. Variables de entorno:

```
ASTRA_BUNDLE_PATH=/secrets/secure-connect.zip
ASTRA_CLIENT_ID=...
ASTRA_CLIENT_SECRET=...
ASTRA_KEYSPACE=inventario
```

4. Ejecutar `db/schema.cql` en el CQL console de Astra y desplegar la imagen publicada en GHCR.

## Despliegue automatizado

- `.github/workflows/ci.yml`: levanta Cassandra real, aplica el esquema y prueba la API.
- `.github/workflows/build-image.yml`: construye y publica la imagen en `ghcr.io`.
- `.github/workflows/deploy.yml`: dispara el despliegue en Render mediante `RENDER_DEPLOY_HOOK`.

## Por qué Cassandra y no otra NoSQL

Cassandra ofrece escritura distribuida sin punto único de fallo, replicación multi-DC y un modelo columnar pensado para consultas por clave de partición. Es la elección natural cuando el volumen de escritura y la disponibilidad pesan más que la flexibilidad de esquema de un documento o la navegación de un grafo.
