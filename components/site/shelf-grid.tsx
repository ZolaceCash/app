import { ShaderFill } from "@/components/site/shader-fill"
import { HANDOVER_LABEL, SHELVES } from "@/lib/catalog"
import { cn } from "@/lib/utils"

// How each shelf is drawn in the four-column grid, in the order of SHELVES. The first shelf is the
// large tile. The shelves that open first are filled (indigo, violet, white); the planned
// ones are graphite like every other tile on the page.
const TILES = [
  { box: "bg-indigo text-white lg:col-span-2 lg:row-span-2", soft: "text-white/75", icon: "text-white" },
  { box: "bg-violet text-white lg:col-span-2", soft: "text-white/75", icon: "text-white" },
  { box: "bg-ice text-ink", soft: "text-ink/65", icon: "text-ink" },
  { box: "bg-card", soft: "text-muted-foreground", icon: "text-brand" },
  { box: "bg-card lg:col-span-2", soft: "text-muted-foreground", icon: "text-brand" },
  { box: "bg-card lg:col-span-2", soft: "text-muted-foreground", icon: "text-brand" },
]

export function ShelfGrid({ className }: { className?: string }) {
  return (
    <ul className={cn("grid gap-2.5 sm:grid-cols-2 lg:auto-rows-[13rem] lg:grid-cols-4", className)}>
      {SHELVES.map((shelf, index) => {
        const tile = TILES[index]
        const large = index === 0
        return (
          <li
            key={shelf.slug}
            className={cn(
              "group relative isolate flex min-h-[11rem] flex-col justify-between overflow-hidden cut rounded-3xl p-6 transition-[transform,clip-path] duration-500 ease-out hover:-translate-y-1 hover:[--cut:2.5rem]",
              tile.box
            )}
          >
            {/* The first shelf is large enough to carry the graphic. #5567ea is its indigo. */}
            {large ? (
              <ShaderFill figure="matrix" background="#5567ea" ink="#1f2358" clear="bottom" className="max-lg:hidden" />
            ) : null}
            <div className="relative flex items-center justify-between">
              <shelf.icon
                className={cn(
                  "transition-transform duration-500 ease-out group-hover:scale-110",
                  large ? "size-10" : "size-7",
                  tile.icon
                )}
              />
              <span className={cn("label-mono", tile.soft)}>
                0{index + 1} · {HANDOVER_LABEL[shelf.handover]}
              </span>
            </div>
            <div className="relative">
              <h3
                className={cn(
                  "font-medium tracking-[-0.035em]",
                  large ? "text-4xl md:text-5xl" : "text-xl"
                )}
              >
                {shelf.name}
              </h3>
              <p className={cn("mt-2 leading-snug", large && "max-w-xs text-lg", tile.soft)}>
                {shelf.blurb}
              </p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
