"use client";

import { useEffect, useRef, useState } from "react";
import { sendRealtime, subscribeRealtime } from "@/lib/realtime-client";
import { typingLifetimeMs } from "@/lib/realtime-types";

export function useTypingSender(conversationId: string) {
  const actions = useRef({ change: (_text: string) => {}, stop: () => {} });
  useEffect(() => {
    const clientId = crypto.randomUUID();
    let active = false;
    let lastSent = 0;
    let idle: ReturnType<typeof setTimeout> | undefined;
    const publish = (value: boolean) => {
      // WebSocket frames preserve start/stop ordering. Never queue stale typing
      // across a reconnect, and never send the private draft text.
      sendRealtime({ type: "typing", conversationId, active: value, clientId });
    };
    const stop = () => {
      clearTimeout(idle);
      if (active) publish(false);
      active = false;
    };
    const change = (text: string) => {
      if (
        !text.trim() ||
        document.visibilityState === "hidden" ||
        !navigator.onLine
      )
        return stop();
      if (!active || Date.now() - lastSent >= 2000) {
        publish(true);
        lastSent = Date.now();
      }
      active = true;
      clearTimeout(idle);
      idle = setTimeout(stop, 2500);
    };
    const hidden = () => {
      if (document.visibilityState === "hidden") stop();
    };
    actions.current = { change, stop };
    window.addEventListener("blur", stop);
    window.addEventListener("pagehide", stop);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      stop();
      window.removeEventListener("blur", stop);
      window.removeEventListener("pagehide", stop);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [conversationId]);
  return actions;
}

export function usePeerTyping(conversationId: string, viewerId: string) {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const clients = new Map<string, number>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expire = () => {
      clearTimeout(timer);
      const now = Date.now();
      for (const [id, deadline] of clients)
        if (deadline <= now) clients.delete(id);
      setTyping(clients.size > 0);
      if (clients.size)
        timer = setTimeout(expire, Math.min(...clients.values()) - now + 10);
    };
    const unsubscribe = subscribeRealtime((event) => {
      if (
        event.type === "ready" ||
        event.type === "reconnect" ||
        event.type === "signed-out"
      ) {
        clients.clear();
        expire();
      }
      if (
        event.type !== "typing" ||
        event.conversationId !== conversationId ||
        event.userId === viewerId
      )
        return;
      if (event.active)
        clients.set(event.clientId, Date.now() + typingLifetimeMs);
      else clients.delete(event.clientId);
      expire();
    });
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [conversationId, viewerId]);
  return typing;
}
