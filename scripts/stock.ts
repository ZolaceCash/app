import { readFileSync } from "node:fs"

import { eq } from "drizzle-orm"

import { getDb, schema } from "../lib/db"

// Puts codes on a shelf: one code per line of a text file.
//   npm run stock -- <product-slug> <file>
// The product must exist and be of kind "stock". The owner's screen at /owner/products does the same
// from a browser; this one runs on the machine that holds the database, so it needs no login.
async function main() {
  const [slug, file] = process.argv.slice(2)
  if (!slug || !file) {
    console.error("Usage: npm run stock -- <product-slug> <file-with-one-code-per-line>")
    process.exit(1)
  }

  const db = await getDb()
  const [product] = await db.select().from(schema.products).where(eq(schema.products.slug, slug))
  if (!product) {
    console.error(`No product with the slug "${slug}".`)
    process.exit(1)
  }
  if (product.kind !== "stock") {
    console.error(`"${slug}" is a test product: its codes are made up at checkout, not uploaded.`)
    process.exit(1)
  }

  const codes = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (codes.length === 0) {
    console.error("The file has no codes in it.")
    process.exit(1)
  }

  await db.insert(schema.stock).values(codes.map((payload) => ({ productId: product.id, payload })))
  console.log(`Added ${codes.length} code(s) to "${product.name}".`)
}

main()
