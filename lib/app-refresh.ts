// Explicitly used by app writes; never patches the browser's fetch function.
export const refreshEvent = "pb:data-changed";
export const refreshBusyEvent = "pb:mutation-busy";
let busy = 0;

export function activeMutations() {
  return busy;
}

export function requestAppRefresh() {
  window.dispatchEvent(new Event(refreshEvent));
}

export function holdAppRefresh() {
  busy += 1;
  window.dispatchEvent(new Event(refreshBusyEvent));
  let released = false;
  return () => {
    if (released) return;
    released = true;
    busy -= 1;
    window.dispatchEvent(new Event(refreshBusyEvent));
  };
}

export async function appFetch(url: string, init?: RequestInit) {
  const method = (init?.method ?? "GET").toUpperCase();
  if (method === "GET" || method === "HEAD") return fetch(url, init);
  const release = holdAppRefresh();
  try {
    const response = await fetch(url, init);
    // Buffer these small API responses before scheduling reconciliation, so
    // the caller can apply its local result before a refresh starts.
    const body = response.body ? await response.arrayBuffer() : null;
    if (response.ok) requestAppRefresh();
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } finally {
    release();
  }
}
