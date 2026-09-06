import { createServer } from "node:http";

// Loopback-only S3 transport fixture. It exercises real SDK serialization,
// presigned browser PUTs and finalization, but does not validate AWS signatures.
export async function startTestStorage() {
  const objects = new Map<string, { bytes: Buffer; mime: string }>();
  const server = createServer(async (request, response) => {
    response.setHeader("access-control-allow-origin", "*");
    response.setHeader("access-control-allow-methods", "GET,HEAD,PUT,OPTIONS");
    response.setHeader("access-control-allow-headers", "*");
    const url = new URL(request.url ?? "/", "http://localhost");
    if (request.method === "OPTIONS") {
      response.writeHead(204).end();
      return;
    }
    if (request.method === "PUT") {
      const parts: Buffer[] = [];
      for await (const part of request) parts.push(Buffer.from(part));
      objects.set(url.pathname, {
        bytes: Buffer.concat(parts),
        mime: String(
          request.headers["content-type"] ?? "application/octet-stream",
        ),
      });
      response.writeHead(200, { ETag: '"test-etag"' }).end();
      return;
    }
    const object = objects.get(url.pathname);
    if (!object) {
      response
        .writeHead(404, { "content-type": "application/xml" })
        .end("<Error><Code>NoSuchKey</Code></Error>");
      return;
    }
    response.writeHead(200, {
      "content-type": object.mime,
      "content-length": object.bytes.length,
      ETag: '"test-etag"',
    });
    response.end(request.method === "HEAD" ? undefined : object.bytes);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Storage fixture failed.");
  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    close: () => server.close(),
  };
}
