// The shape of long-form content (the docs and the whitepaper). Text lives in plain data so it can
// be read and corrected without touching layout; components/site/blocks.tsx draws it.
export type Block =
  | { p: string }
  | { list: string[] }
  // A two-column table of short facts: name on the left, value on the right.
  | { rows: [string, string][] }
  // Something that is not decided, not built or not checked yet. Said where it applies.
  | { open: string }

export type Section = {
  id: string
  heading: string
  blocks: Block[]
}
