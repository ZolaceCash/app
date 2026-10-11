// Says the server is up. The container's health check asks this (docker-compose.yml). It reads
// nothing and says nothing about the shop.
export function GET() {
  return Response.json({ ok: true });
}
