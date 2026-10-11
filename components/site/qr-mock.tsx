// A pattern that reads as a QR code and encodes nothing. Used wherever a drawing of a payment
// screen needs one.
const SIZE = 25
const CORNERS = [
  [0, 0],
  [SIZE - 7, 0],
  [0, SIZE - 7],
]

const CELLS = (() => {
  const cells: { x: number; y: number }[] = []
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const corner = CORNERS.find(
        ([cx, cy]) => x >= cx - 1 && x <= cx + 7 && y >= cy - 1 && y <= cy + 7
      )
      if (corner) {
        const dx = x - corner[0]
        const dy = y - corner[1]
        const inside = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6
        const ring = dx === 0 || dx === 6 || dy === 0 || dy === 6
        const eye = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4
        if (inside && (ring || eye)) cells.push({ x, y })
      } else if (((x * 73856093) ^ (y * 19349663) ^ (x * y * 83492791)) % 7 < 3) {
        cells.push({ x, y })
      }
    }
  }
  return cells
})()

export function QrMock({ className }: { className?: string }) {
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} shapeRendering="crispEdges" className={className}>
      {CELLS.map((cell) => (
        <rect key={`${cell.x}-${cell.y}`} x={cell.x} y={cell.y} width="1" height="1" fill="#0b0b10" />
      ))}
    </svg>
  )
}
