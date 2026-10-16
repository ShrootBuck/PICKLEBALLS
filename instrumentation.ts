export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startServerMonitor } = await import("@/lib/server-monitor-server");
    startServerMonitor();
    const { startRealtimeWebSocketServer } = await import(
      "@/lib/realtime-websocket-server"
    );
    await startRealtimeWebSocketServer();
  }
}
