import { mkdirSync } from "node:fs"
import path from "node:path"

import { createClient } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import { migrate } from "drizzle-orm/libsql/migrator"

import * as schema from "./schema"
import { seedTestItems } from "./seed"

// Where the database is. By default one SQLite file under ./data, which needs a disk that stays
// (a server or a container with a volume). On a host without one, DATABASE_URL points at a hosted
// libSQL database instead, with its token in DATABASE_AUTH_TOKEN. Tests use a file of their own.
const url = process.env.DATABASE_URL ?? `file:${path.join(process.cwd(), "data", "zolace.db")}`

async function open() {
  if (url.startsWith("file:") && !url.startsWith("file::memory:")) {
    mkdirSync(path.dirname(url.slice("file:".length)), { recursive: true })
  }
  const db = drizzle(createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN }), { schema })
  // Bring the database up to the current schema once, before the first query, and put the test
  // items on an empty shelf, so a fresh deployment has something to order.
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") })
  await seedTestItems(db)
  return db
}

export type Db = Awaited<ReturnType<typeof open>>

// Kept on globalThis so a hot reload in development reuses the connection instead of opening
// another one to the same file. Opened on first use, not on import: where no database can be
// opened (a host with a read-only disk and no DATABASE_URL), the pages that do not need one still
// load, and the ones that do can say so.
const holder = globalThis as unknown as { zolaceDb?: Promise<Db> }

export function getDb() {
  if (!holder.zolaceDb) {
    holder.zolaceDb = open().catch((error) => {
      // Do not keep a failed attempt: the next request tries again.
      holder.zolaceDb = undefined
      throw error
    })
  }
  return holder.zolaceDb
}

export { schema }
