import { MongoClient } from "mongodb"
import "dotenv/config"

/**
 * One shared connection for the whole process.
 *
 * On Vercel the handler is reused between requests, so the client is cached
 * on `globalThis` to avoid opening a new connection on every invocation.
 */
const globalForMongo = globalThis

function buildConnectionString() {
  if (process.env.MONGODB_URI) {
    return process.env.MONGODB_URI
  }

  const user = process.env.DB_USER
  const pass = process.env.DB_PASS
  const host = process.env.DB_HOST || "cluster0.q6px8ox.mongodb.net"

  if (!user || !pass) {
    throw new Error(
      "Missing MongoDB credentials. Set MONGODB_URI or DB_USER and DB_PASS."
    )
  }

  return `mongodb+srv://${user}:${pass}@${host}/`
}

export function getDbName() {
  return process.env.DB_NAME || process.env.MONGODB_DB || "salonbookdb"
}

export async function connectToMongoDB() {
  if (globalForMongo.__salonbookClient) {
    return globalForMongo.__salonbookClient
  }

  const client = new MongoClient(buildConnectionString())
  await client.connect()

  globalForMongo.__salonbookClient = client
  console.log("[db] connected to MongoDB")
  return client
}

export async function getDb() {
  const client = await connectToMongoDB()
  return client.db(getDbName())
}

/** Convenience helper for the common collections. */
export async function collections() {
  const db = await getDb()
  return {
    db,
    services: db.collection("services"),
    appointments: db.collection("appointments"),
    transactions: db.collection("transactions"),
    users: db.collection("user"),
    sessions: db.collection("session"),
  }
}
