# Construir y desplegar una aplicación con Apache Cassandra

**Curso:** SI783 – Base de Datos II · **Actividad Grupal 01-U2**
**Autores:** Rodriguez Cardenas, Patrick Elvis · Rios Cohaila, Nicole Luciana
**Repositorio:** https://github.com/dejameingresar/inventario-cassandra

---

## Por qué Cassandra

Cuando se elige una base NoSQL la pregunta correcta no es "cuál es más moderna" sino "qué patrón de acceso voy a tener". Cassandra es una base columnar distribuida, pensada para escrituras intensivas, alta disponibilidad y crecimiento horizontal por nodos. No tiene un nodo maestro: cada nodo puede atender lecturas y escrituras, y la replicación se define por keyspace.

Eso la diferencia de las otras familias: un documento (MongoDB) brilla cuando el objeto se lee completo y su forma cambia; un grafo (Neo4j) cuando lo importante son las relaciones; una clave-valor (Redis) cuando se necesita latencia mínima sobre datos efímeros. Cassandra gana cuando el volumen manda y la consulta siempre entra por una clave conocida.

## Modelado: la consulta primero

En Cassandra la tabla se diseña a partir de la consulta, no del diagrama entidad-relación. La aplicación necesita listar productos por categoría, así que la tabla queda así:

```cql
CREATE TABLE inventario.productos_por_categoria (
  categoria text,
  id uuid,
  nombre text,
  precio decimal,
  stock int,
  actualizado timestamp,
  PRIMARY KEY ((categoria), id)
);
```

`categoria` es la **partition key**: todos los productos de una categoría viven en la misma partición, y la lectura `WHERE categoria = ?` se resuelve en un solo nodo sin `ALLOW FILTERING`. `id` como clustering key ordena dentro de la partición y garantiza unicidad del producto.

Este es el punto donde más se falla al venir de SQL: si se modela pensando en `JOIN` y en normalización, en Cassandra se termina con consultas que exigen `ALLOW FILTERING` y degradan el clúster. La regla práctica es una tabla por consulta.

## La API

Node.js 20 con Express y el driver oficial `cassandra-driver`. La conexión se abstrae para soportar dos entornos sin cambiar el código: Cassandra local en Docker y Astra DB en producción.

```js
function buildClient() {
  const secureBundle = process.env.ASTRA_BUNDLE_PATH;
  if (secureBundle) {
    return new cassandra.Client({
      cloud: { secureConnectBundle: secureBundle },
      credentials: { username: process.env.ASTRA_CLIENT_ID,
                     password: process.env.ASTRA_CLIENT_SECRET },
      keyspace: process.env.ASTRA_KEYSPACE,
    });
  }
  return new cassandra.Client({
    contactPoints: (process.env.CASSANDRA_CONTACT_POINTS || "127.0.0.1").split(","),
    localDataCenter: process.env.CASSANDRA_DC || "datacenter1",
    keyspace: "inventario",
  });
}
```

Las consultas van con `prepare: true`. Eso es importante en Cassandra: las sentencias preparadas evitan el parseo repetido en el coordinador y evitan inyección, porque los valores viajan como parámetros binarios y no como texto CQL.

El upsert es natural en este motor: `INSERT` sobre una clave existente actualiza los campos enviados. No hay `MERGE` ni verificación previa de existencia.

## Automatización

Tres flujos de GitHub Actions cubren el ciclo completo:

1. **ci.yml** — levanta un contenedor `cassandra:5` real, espera a que acepte CQL, aplica `schema.cql` y `seed.cql`, arranca la API y verifica `/health` y `/productos/laptops`. La prueba no usa mocks: si el esquema está mal, el pipeline falla.
2. **build-image.yml** — construye la imagen y la publica en `ghcr.io` con dos etiquetas: `latest` y el SHA del commit, para poder volver a una versión exacta.
3. **deploy.yml** — al terminar la construcción, dispara el despliegue en el proveedor mediante un webhook guardado como secreto (`RENDER_DEPLOY_HOOK`).

Con eso, el camino desde `git push` hasta una versión nueva en producción no requiere intervención manual ni comandos en un servidor.

## Despliegue en la nube

La base de datos va en **Astra DB**, la oferta gestionada de Cassandra: se crea un keyspace serverless, se descarga el *Secure Connect Bundle* y se genera un token con permisos solo sobre ese keyspace. La API se despliega como contenedor en un servicio PaaS y recibe el bundle y las credenciales por variables de entorno, nunca en el repositorio.

Detalle que suele olvidarse: el *Secure Connect Bundle* es un archivo, no una cadena de conexión. En un PaaS hay que montarlo como secreto o descargarlo al arrancar; no sirve pegarlo en una variable de entorno de texto.

## Qué se aprendió

- El esquema en Cassandra se deriva de la consulta; modelar "en tercera forma normal" lleva directo a `ALLOW FILTERING`.
- La partition key decide el rendimiento y también los límites: una partición demasiado grande degrada el nodo que la aloja.
- Las sentencias preparadas son obligatorias en la práctica, no un adorno.
- Un pipeline que levanta la base real cuesta minutos y evita el clásico "en mi máquina funciona".
