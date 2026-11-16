# Estrategia de respaldo para Apache Cassandra

**Curso:** SI783 – Base de Datos II · **Actividad Grupal 02-U2**
**Autores:** Rodriguez Cardenas, Patrick Elvis · Rios Cohaila, Nicole Luciana
**Repositorio:** https://github.com/dejameingresar/inventario-cassandra

---

## El problema

En una base distribuida el respaldo no es "copiar el archivo". Cassandra reparte los datos en varios nodos según la partition key, replica cada fila en N nodos y escribe en memoria primero (memtable) para luego volcar a disco (SSTable). Un respaldo coherente tiene que considerar las tres cosas: qué nodo tiene qué token, qué réplicas están vivas y qué parte de los datos todavía no bajó a disco.

## Niveles de respaldo

**1. Snapshot por nodo (`nodetool snapshot`).** Crea un hard link de las SSTables actuales en `sstables/<keyspace>/<tabla>-<uuid>/snapshots/<nombre>`. Es instantáneo y no duplica el espacio hasta que las SSTables cambian. Se complementa con `nodetool flush` previo para vaciar la memtable y con `nodetool clearsnapshot` para no acumular.

```bash
nodetool flush inventario
nodetool snapshot -t backup_2026_11_16 inventario
# copiar snapshots fuera del nodo
tar czf inventario_2026_11_16.tar.gz \
  /var/lib/cassandra/data/inventario/*/snapshots/backup_2026_11_16
```

**2. Respaldo gestionado.** En Astra DB el proveedor administra snapshots y retención; el equipo define la ventana y la política. Es la opción razonable cuando no se quiere mantener infraestructura de respaldo propia, a cambio de depender del proveedor.

**3. Export lógico.** `cqlsh COPY ... TO` o `dsbulk unload` generan CSV de una tabla. Sirve para migraciones y para respaldos pequeños, pero no escala: recorre todas las filas y compite con el tráfico de producción.

## Qué hace un respaldo realmente útil

Un respaldo que nunca se restauró no es un respaldo. La estrategia se define por dos números: **RPO** (cuántos datos puedo perder) y **RTO** (cuánto puedo tardar en volver). Para un inventario que se actualiza durante el día, un RPO de 24 h con snapshots diarios es insuficiente; se necesitan incrementales más frecuentes o replicación a otra región.

Puntos que se pasan por alto:

- **Topología en la restauración.** Restaurar en un clúster con distinto número de nodos exige rebalancear tokens; no basta con copiar directorios.
- **Esquema incluido.** El respaldo debe incluir `DESCRIBE KEYSPACE` o el `.cql` del esquema: los datos sin esquema no se pueden releer.
- **Consistencia de la copia entre nodos.** Si se respalda nodo por nodo sin coordinar, dos copias del mismo día pueden representar estados distintos. Lo correcto es snapshot en ventana común o usar el mecanismo del proveedor.
- **Cifrado y retención.** El respaldo contiene los mismos datos sensibles que producción; se cifra en reposo y se define cuánto tiempo se conserva.

## Procedimiento propuesto

| Frecuencia | Acción | Retención | RPO |
|---|---|---|---|
| Diario 02:00 | Snapshot + copia a almacenamiento de objetos | 14 días | 24 h |
| Cada 6 h | Snapshot incremental a otra región | 7 días | 6 h |
| Semanal | Prueba de restauración en clúster aislado | — | — |
| Mensual | Export lógico del esquema y tablas críticas | 12 meses | — |

La prueba de restauración semanal es la parte que casi nadie hace y la que decide si el plan sirve. Se restaura en un clúster aislado, se valida el conteo de filas por partición y se documenta el tiempo real que tomó.

## Verificación

```cql
-- tras restaurar, comparar cardinalidad por partición con producción
SELECT categoria, count(*) FROM inventario.productos_por_categoria GROUP BY categoria;
```

Si los conteos no cuadran, el respaldo no sirve, independientemente de que el archivo exista y pese lo esperado.

## Qué se aprendió

- El respaldo en Cassandra se piensa por nodo y por token, no por base de datos.
- Un snapshot sin `flush` previo deja fuera lo que está en memoria.
- RPO y RTO definen la estrategia; sin esos números, cualquier política es arbitraria.
- La única prueba válida de un respaldo es restaurarlo y comparar datos.
