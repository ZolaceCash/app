"use client"

import { useEffect, useRef } from "react"

import { useInView } from "@/lib/use-in-view"
import { cn } from "@/lib/utils"

// The site's graphic: a small fragment shader drawn in two solid colours, the surface's own and
// one other. It fills its parent, behind the content (the parent needs `relative` and
// `overflow-hidden`, and its content needs `relative` to sit on top). It is rendered at a third
// of its size and scaled up without smoothing, so it reads as crisp pixels, and the pattern is put
// through an ordered dither so it thins out towards the text instead of fading.
// Seven figures share one shader; `figure` picks which. Each one on a page holds a WebGL context,
// and browsers allow only about sixteen, so use it on a few surfaces, not on every tile.
export const FIGURES = ["flow", "contour", "matrix", "sweep", "decode", "rings", "diamond"] as const
export type Figure = (typeof FIGURES)[number]

// One canvas pixel covers this many CSS pixels.
const CELL = 3
const FRAME_MS = 33

const VERTEX = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }
`

const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 r;   // canvas size
uniform float t;  // seconds
uniform float k;  // which figure
uniform float z;  // which part stays clear of it
uniform vec3 a;   // the card's colour
uniform vec3 b;   // the figure's colour

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float w = 0.5;
  for (int i = 0; i < 4; i++) { v += w * noise(p); p *= 2.03; w *= 0.5; }
  return v;
}

// A 4x4 ordered-dither threshold for this pixel, 0 to just under 1.
float bayer2(vec2 p) { p = floor(p); return fract(p.x / 2.0 + p.y * p.y * 0.75); }
float bayer4(vec2 p) { return bayer2(0.5 * p) * 0.25 + bayer2(p); }

void main() {
  vec2 px = gl_FragCoord.xy;
  vec2 uv = px / r;
  float aspect = r.x / r.y;
  vec2 q = vec2(uv.x * aspect, uv.y);
  // The figures with a centre sit right of the middle, clear of the text; in a strip they rise
  // from the middle of the bottom edge.
  vec2 c = q - (z > 2.5 ? vec2(aspect * 0.5, 0.0) : vec2(aspect * 0.76, 0.42));
  float d = length(c);
  float v = 0.0;

  if (k < 0.5) {
    // flow: drifting cloud
    v = smoothstep(0.3, 0.8, fbm(q * 2.4 + vec2(t * 0.10, -t * 0.06)));
  } else if (k < 1.5) {
    // contour: the level lines of a slow field
    float f = fbm(q * 1.7 + vec2(t * 0.05, t * 0.03));
    v = step(abs(fract(f * 8.0) - 0.5), 0.06);
  } else if (k < 2.5) {
    // matrix: blocks that switch on and off, like a code being drawn
    vec2 g = floor(px / 4.0);
    float beat = floor(t * 1.2 + hash(g) * 5.0);
    v = step(0.66, hash(g + beat * 0.173)) * step(0.5, mod(px.x, 4.0)) * step(0.5, mod(px.y, 4.0));
  } else if (k < 3.5) {
    // sweep: a hand going round a dial
    float turn = fract(atan(c.y, c.x) / 6.2831853 + t * 0.06);
    v = turn * turn * step(d, 0.40) + step(abs(d - 0.44), 0.012);
  } else if (k < 4.5) {
    // decode: static on one side of a front, order on the other
    float row = floor(px.y / 3.0);
    float front = fract(t * 0.07) * 1.6 - 0.3;
    float open = smoothstep(front - 0.25, front, uv.x);
    float fuzz = hash(vec2(floor(px.x / 2.0), row + floor(t * 6.0)));
    v = mix(fuzz, 0.5 + 0.5 * sin(row * 0.9), open) * 0.9;
  } else if (k < 5.5) {
    // rings: ripples leaving a point
    v = (0.5 + 0.5 * sin(d * 34.0 - t * 1.6)) * smoothstep(0.75, 0.1, d);
  } else {
    // diamond: the same ripples on a rhombus
    float m = abs(c.x) * 1.25 + abs(c.y);
    v = (0.5 + 0.5 * sin(m * 30.0 - t * 1.4)) * smoothstep(0.7, 0.12, m);
  }

  // Where the figure may be drawn. uv.y runs upward, so 1.0 is the top edge.
  float room;
  if (z < 0.5) {
    // card: the left side (the text), the top (the head) and the very bottom stay clear. The
    // figure keeps to the right third and thins out early: the owner found a fuller card crowded
    room = smoothstep(0.60, 1.0, uv.x) * (1.0 - smoothstep(0.60, 0.80, uv.y)) * smoothstep(0.0, 0.12, uv.y);
  } else if (z < 1.5) {
    // left: a wide banner with its text on the left
    room = smoothstep(0.56, 0.96, uv.x);
  } else if (z < 2.5) {
    // bottom: a tall tile with a row of labels on top and its text at the bottom
    float above = smoothstep(0.38, 0.64, uv.y) * smoothstep(0.12, 0.70, uv.x);
    float right = smoothstep(0.60, 0.95, uv.x);
    room = max(above, right) * (1.0 - smoothstep(0.66, 0.80, uv.y));
  } else {
    // strip: a band along the bottom edge, under the text. Measured in canvas pixels: the
    // surface grows with its text and the band should not.
    room = 1.0 - smoothstep(24.0, 44.0, px.y);
  }
  float on = step(bayer4(px) + 0.03, v * room);
  gl_FragColor = vec4(mix(a, b, on), 1.0);
}
`

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

const CLEAR = ["card", "left", "bottom", "strip"] as const

export function ShaderFill({
  figure,
  background,
  ink,
  clear = "card",
  active = true,
  className,
}: {
  figure: Figure
  // The surface's fill and the colour the figure is drawn in, as #rrggbb. `background` must be
  // the same colour as the surface, or the canvas shows as a box.
  background: string
  ink: string
  // Which part of the surface the figure keeps out of (see `room` in the shader).
  clear?: (typeof CLEAR)[number]
  // False holds the last frame. A figure also rests whenever it is off screen.
  active?: boolean
  className?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const draw = useRef<((seconds: number) => void) | null>(null)
  const inView = useInView(ref, 0.05)

  useEffect(() => {
    const canvas = ref.current
    const gl = canvas?.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" })
    // Without WebGL the canvas stays empty and the card shows its plain fill.
    if (!canvas || !gl) return

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      return shader
    }
    const program = gl.createProgram()!
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX))
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return
    gl.useProgram(program)

    // One triangle that covers the whole canvas.
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, "p")
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

    const uniform = (name: string) => gl.getUniformLocation(program, name)
    gl.uniform1f(uniform("k"), FIGURES.indexOf(figure))
    gl.uniform1f(uniform("z"), CLEAR.indexOf(clear))
    gl.uniform3fv(uniform("a"), rgb(background))
    gl.uniform3fv(uniform("b"), rgb(ink))
    const size = uniform("r")
    const time = uniform("t")

    let last = performance.now() / 1000
    draw.current = (seconds) => {
      last = seconds
      const width = Math.max(1, Math.round(canvas.clientWidth / CELL))
      const height = Math.max(1, Math.round(canvas.clientHeight / CELL))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
        gl.viewport(0, 0, width, height)
      }
      gl.uniform2f(size, width, height)
      gl.uniform1f(time, seconds)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    draw.current(last)

    const observer = new ResizeObserver(() => draw.current?.(last))
    observer.observe(canvas)
    // The context is left alone on cleanup: a canvas only ever has one, so giving it up here would
    // leave the next run of this effect (React runs it twice in development) with a dead one.
    return () => {
      observer.disconnect()
      draw.current = null
      gl.deleteProgram(program)
    }
  }, [figure, background, ink, clear])

  useEffect(() => {
    if (!active || !inView) return
    let frame = 0
    let last = 0
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      if (now - last < FRAME_MS) return
      last = now
      draw.current?.(now / 1000)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [active, inView])

  return (
    <canvas
      ref={ref}
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 size-full [image-rendering:pixelated]", className)}
    />
  )
}
