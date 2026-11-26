const cassandra = require("cassandra-driver");
const fs = require("fs");
const os = require("os");
const path = require("path");

const TABLE = "productos_por_categoria";

// Datos semilla del modo publico: los mismos de db/seed.cql, con UUID fijos
// para que la particion "laptops" sea estable entre despliegues.
const SEED = [
  {
    categoria: "laptops",
    id: "1a5f4c30-7d1b-4e2a-9c64-0b8e2f5a7d11",
    nombre: "ThinkPad E14",
    precio: 1250.0,
    stock: 12,
  },
  {
    categoria: "laptops",
    id: "2b6a5d41-8e2c-4f3b-ad75-1c9f3a6b8e22",
    nombre: "MacBook Air M3",
    precio: 1499.0,
    stock: 5,
  },
  {
    categoria: "monitores",
    id: "3c7b6e52-9f3d-4a4c-be86-2d0a4b7c9f33",
    nombre: "Dell U2723QE",
    precio: 549.9,
    stock: 20,
  },
];

function textId(value) {
  return value && typeof value === "object" && typeof value.toString === "function"
    ? value.toString()
    : String(value);
}

// Almacen embebido con la misma interfaz execute() que el driver.
// Se usa solo cuando no hay ASTRA_BUNDLE_PATH ni CASSANDRA_CONTACT_POINTS.
function buildMemoryClient() {
  const rows = new Map();
  for (const item of SEED) {
    rows.set(`${item.categoria}|${item.id}`, { ...item, actualizado: new Date() });
  }

  return {
    mode: "memory",
    async execute(cql, params = []) {
      const query = cql.replace(/\s+/g, " ").trim();

      if (query.startsWith("SELECT now() FROM system.local")) {
        return { rows: [{ now: new Date() }] };
      }

      if (query.startsWith(`SELECT * FROM ${TABLE} WHERE categoria = ?`)) {
        const categoria = params[0];
        return {
          rows: [...rows.values()]
            .filter((r) => r.categoria === categoria)
            .sort((a, b) => a.id.localeCompare(b.id)),
        };
      }

      if (query.startsWith(`INSERT INTO ${TABLE}`)) {
        const [categoria, id, nombre, precio, stock] = params;
        const key = `${categoria}|${textId(id)}`;
        rows.set(key, {
          categoria,
          id: textId(id),
          nombre,
          precio,
          stock,
          actualizado: new Date(),
        });
        return { rows: [] };
      }

      if (query.startsWith(`DELETE FROM ${TABLE} WHERE categoria = ? AND id = ?`)) {
        rows.delete(`${params[0]}|${textId(params[1])}`);
        return { rows: [] };
      }

      throw new Error(`Consulta no soportada en modo publico: ${query}`);
    },
  };
}

function buildClient() {
  const username = process.env.ASTRA_CLIENT_ID;
  const password = process.env.ASTRA_CLIENT_SECRET;
  const keyspace = process.env.ASTRA_KEYSPACE || "inventario";

  // En PaaS no se puede montar un archivo secreto; el bundle viaja en base64.
  let secureBundle = process.env.ASTRA_BUNDLE_PATH;
  if (!secureBundle && process.env.ASTRA_BUNDLE_BASE64) {
    secureBundle = path.join(os.tmpdir(), "secure-connect.zip");
    fs.writeFileSync(secureBundle, Buffer.from(process.env.ASTRA_BUNDLE_BASE64, "base64"));
  }

  if (secureBundle) {
    const client = new cassandra.Client({
      cloud: { secureConnectBundle: secureBundle },
      credentials: { username, password },
      keyspace,
    });
    client.mode = "cassandra";
    return client;
  }

  if (process.env.CASSANDRA_CONTACT_POINTS) {
    const contactPoints = process.env.CASSANDRA_CONTACT_POINTS.split(",");
    const localDataCenter = process.env.CASSANDRA_DC || "datacenter1";
    const client = new cassandra.Client({ contactPoints, localDataCenter, keyspace });
    client.mode = "cassandra";
    return client;
  }

  return buildMemoryClient();
}

module.exports = { buildClient, cassandra };
