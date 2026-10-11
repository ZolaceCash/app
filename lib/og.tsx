import { ImageResponse } from "next/og"

// The picture a link to the site gets where it is shared. One layout for every page: a graphite
// tile with the words and an indigo tile with the mark, on the site's near-black ground. Drawn in
// the image maker's own font, which is the site's (Geist), in one weight.
export const OG_SIZE = { width: 1200, height: 630 }

const GROUND = "#09090b"
const TILE = "#111114"
const INK = "#f4f4f6"
const SOFT = "#9a9aa6"
const BRAND = "#7b8cff"
const INDIGO = "#5567ea"

const FACTS = ["No account", "A link for a receipt", "Opened in your browser"]

// The mark from app/icon.svg, without its square.
function Mark({ size, fill }: { size: number; fill: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}>
      <polygon points="8.1,2 22,2 13.25,14.5 10.65,14.5 15.9,7 4.6,7" />
      <polygon points="19.4,17 15.9,22 2,22 10.75,9.5 13.35,9.5 8.1,17" />
      <polygon points="5.5,2 7,2 3.5,7 2,7" />
      <polygon points="20.5,17 22,17 18.5,22 17,22" />
    </svg>
  )
}

export type OgCard = {
  // The small line over the title: where on the site the link leads.
  label: string
  title: string
  // For an item: its price, and how it is paid.
  price?: string
  paid?: string
}

export function ogCard({ label, title, price, paid }: OgCard) {
  // A long name is set smaller, so it stays inside the tile.
  const titleSize = title.length > 60 ? 50 : title.length > 34 ? 62 : 76
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", gap: 14, padding: 28, background: GROUND, color: INK }}>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: 52,
            borderRadius: 36,
            background: TILE,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: BRAND }} />
            <div style={{ fontSize: 24, letterSpacing: 4, textTransform: "uppercase", color: SOFT }}>{label}</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: titleSize, lineHeight: 1.04, letterSpacing: -2.5 }}>{title}</div>
            {price ? (
              <div style={{ display: "flex", alignItems: "baseline", gap: 22, marginTop: 34 }}>
                <div style={{ fontSize: 92, lineHeight: 1, letterSpacing: -4 }}>{price}</div>
                {paid ? (
                  <div style={{ fontSize: 24, letterSpacing: 3, textTransform: "uppercase", color: BRAND }}>{paid}</div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            {FACTS.map((fact) => (
              <div
                key={fact}
                style={{
                  display: "flex",
                  flexShrink: 0,
                  padding: "11px 15px",
                  borderRadius: 10,
                  background: "#1b1b20",
                  fontSize: 17,
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                  color: SOFT,
                }}
              >
                {fact}
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            width: 300,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: 40,
            borderRadius: 36,
            background: INDIGO,
            color: "#fff",
          }}
        >
          <Mark size={150} fill="#fff" />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 46, letterSpacing: -1.5 }}>zolace</div>
            <div style={{ marginTop: 6, fontSize: 22, letterSpacing: 2, textTransform: "uppercase", color: "rgba(255,255,255,0.78)" }}>
              zolace.cash
            </div>
          </div>
        </div>
      </div>
    ),
    OG_SIZE
  )
}
