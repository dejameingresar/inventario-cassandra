const cassandra = require("cassandra-driver");
const fs = require("fs");
const path = require("path");

function buildClient() {
  const secureBundle = process.env.ASTRA_BUNDLE_PATH;
  const username = process.env.ASTRA_CLIENT_ID;
  const password = process.env.ASTRA_CLIENT_SECRET;
  const keyspace = process.env.ASTRA_KEYSPACE || "inventario";

  if (secureBundle) {
    return new cassandra.Client({
      cloud: { secureConnectBundle: secureBundle },
      credentials: { username, password },
      keyspace,
    });
  }

  // modo local (docker compose): CASSANDRA_CONTACT_POINTS=127.0.0.1
  const contactPoints = (process.env.CASSANDRA_CONTACT_POINTS || "127.0.0.1").split(",");
  const localDataCenter = process.env.CASSANDRA_DC || "datacenter1";
  return new cassandra.Client({ contactPoints, localDataCenter, keyspace });
}

module.exports = { buildClient, cassandra };
