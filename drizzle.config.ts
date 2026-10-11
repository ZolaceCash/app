import { defineConfig } from "drizzle-kit"

// Used by `npm run db:generate` to write a migration whenever lib/db/schema.ts changes.
// The app applies the migrations in ./drizzle by itself when it opens the database.
export default defineConfig({
  dialect: "sqlite",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
})
