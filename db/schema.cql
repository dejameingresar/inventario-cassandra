CREATE KEYSPACE IF NOT EXISTS inventario
  WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1};

CREATE TABLE IF NOT EXISTS inventario.productos_por_categoria (
  categoria text,
  id uuid,
  nombre text,
  precio decimal,
  stock int,
  actualizado timestamp,
  PRIMARY KEY ((categoria), id)
);
