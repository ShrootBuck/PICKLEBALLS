export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startRealtimeWebSocketServer } = await import(
      "@/lib/realtime-websocket-server"
    );
    await startRealtimeWebSocketServer();
  }
}
