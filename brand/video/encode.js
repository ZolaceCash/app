// Writes a film from a canvas one frame at a time: the page draws the moment it is asked for, the
// browser's own H.264 encoder takes the picture with the time it belongs to, and mp4-muxer puts
// the result into an ordinary MP4. Nothing depends on how fast the machine plays, so no frame is
// dropped or held (recording the canvas as it played held one frame for five seconds at the start).
import { ArrayBufferTarget, Muxer } from "./mp4-muxer.mjs"

export async function encodeFilm({ canvas, total, fps = 30, bitrate = 10_000_000, ready, draw, onFrame }) {
  const config = {
    codec: "avc1.640028",
    width: canvas.width,
    height: canvas.height,
    bitrate,
    framerate: fps,
    avc: { format: "avc" },
    latencyMode: "quality",
  }
  const support = await VideoEncoder.isConfigSupported(config)
  if (!support.supported) throw new Error("this browser cannot encode " + config.codec)
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width: canvas.width, height: canvas.height, frameRate: fps },
    // The index goes at the front of the file, where players and upload checks look for it.
    fastStart: "in-memory",
  })
  let failed = null
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (error) => (failed = error),
  })
  encoder.configure(config)
  const count = Math.round(total * fps)
  for (let i = 0; i < count; i++) {
    const time = i / fps
    await ready(time)
    draw(time)
    const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / fps), duration: Math.round(1e6 / fps) })
    encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 })
    frame.close()
    while (encoder.encodeQueueSize > 4) await new Promise((later) => setTimeout(later, 1))
    if (failed) throw failed
    if (onFrame && i % 150 === 0) onFrame(i, count)
  }
  await encoder.flush()
  if (failed) throw failed
  muxer.finalize()
  return { blob: new Blob([muxer.target.buffer], { type: "video/mp4" }), frames: count }
}
