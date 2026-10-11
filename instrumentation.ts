// Runs once when the server starts. What it starts needs Node, so it is only loaded there.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
