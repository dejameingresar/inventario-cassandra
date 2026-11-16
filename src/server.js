const express = require("express");
const { buildClient, cassandra } = require("./db");

const app = express();
app.use(express.json());

const client = buildClient();
const TABLE = "productos_por_categoria";

app.get("/health", async (_req, res) => {
  try {
    await client.execute("SELECT now() FROM system.local");
    res.json({ status: "ok", db: "cassandra" });
  } catch (e) {
    res.status(500).json({ status: "error", message: e.message });
  }
});

// Lista por categoria (partition key)
app.get("/productos/:categoria", async (req, res) => {
  try {
    const rs = await client.execute(
      `SELECT * FROM ${TABLE} WHERE categoria = ?`,
      [req.params.categoria],
      { prepare: true }
    );
    res.json(rs.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Inserta o actualiza
app.put("/productos/:categoria/:id", async (req, res) => {
  const { categoria, id } = req.params;
  const { nombre, precio, stock } = req.body;
  try {
    await client.execute(
      `INSERT INTO ${TABLE} (categoria, id, nombre, precio, stock, actualizado)
       VALUES (?, ?, ?, ?, ?, toTimestamp(now()))`,
      [categoria, cassandra.types.Uuid.fromString(id), nombre, precio, stock],
      { prepare: true }
    );
    res.status(201).json({ ok: true, categoria, id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/productos/:categoria/:id", async (req, res) => {
  const { categoria, id } = req.params;
  try {
    await client.execute(
      `DELETE FROM ${TABLE} WHERE categoria = ? AND id = ?`,
      [categoria, cassandra.types.Uuid.fromString(id)],
      { prepare: true }
    );
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API escuchando en :${port}`));
