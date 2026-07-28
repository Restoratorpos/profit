import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { config } from "../config/index.js";
import * as schema from "./schema.js";

// createPool is lazy — no socket is opened until the first query, which is what
// lets tests import the app without a database running.
const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  connectionLimit: 10,
  waitForConnections: true,
  enableKeepAlive: true,
  // Ping the socket every 10s. The database is remote, and an idle TCP
  // connection through NAT is silently dropped long before MySQL's own
  // wait_timeout would close it.
  keepAliveInitialDelay: 10_000,
  // Retire our own idle connections before anything upstream can. Without this
  // the pool eventually hands out a socket the far end has already closed, and
  // the first query on it fails with ECONNRESET — after a long stall, because
  // the failure is only discovered on write.
  idleTimeout: 60_000,
  maxIdle: 5,
});

export const db = drizzle(pool, { schema, mode: "default" });

export const pingDatabase = async (): Promise<void> => {
  const connection = await pool.getConnection();

  try {
    await connection.ping();
  } finally {
    connection.release();
  }
};

export const closeDatabase = (): Promise<void> => pool.end();

export * from "./schema.js";
