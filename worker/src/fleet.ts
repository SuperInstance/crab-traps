// Fleet layer — proxy /fleet/* to the home PLATO boat with a hard 5s timeout.
// The home boat (WSL box) sleeps and changes IP: when it is unreachable we
// serve a friendly stub and keep recording catches. Never hang, never 502.

import {
  Env,
  FLEET_TIMEOUT_MS,
  DEFAULT_FLEET_BASE,
  fetchWithTimeout,
  fleetAsleepStub,
  jsonResponse,
} from "./index-helpers";

export function fleetBase(env: Env): string {
  const base = (env.FLEET_BASE_URL || DEFAULT_FLEET_BASE).trim();
  return base.replace(/\/+$/, "");
}

interface FleetStatus {
  online: boolean;
  checkedAt: number;
}

let fleetStatusCache: FleetStatus | null = null;
const FLEET_STATUS_TTL_MS = 30_000;

/** Test hook — clear the module-level status cache. */
export function resetFleetStatusCache(): void {
  fleetStatusCache = null;
}

/** Probe the home boat, cached for 30s per isolate. */
export async function getFleetStatus(env: Env): Promise<FleetStatus> {
  const now = Date.now();
  if (fleetStatusCache && now - fleetStatusCache.checkedAt < FLEET_STATUS_TTL_MS) {
    return fleetStatusCache;
  }
  let online = false;
  try {
    const res = await fetchWithTimeout(
      `${fleetBase(env)}/`,
      { headers: { "user-agent": "crab-trap-health/1.0" } },
      FLEET_TIMEOUT_MS
    );
    online = true; // any HTTP answer means the boat is awake
    void res.body?.cancel();
  } catch {
    online = false;
  }
  fleetStatusCache = { online, checkedAt: now };
  return fleetStatusCache;
}

export async function handleFleetProxy(
  request: Request,
  env: Env,
  cors: Record<string, string>,
  subpath: string
): Promise<Response> {
  const url = new URL(request.url);
  const target = `${fleetBase(env)}/${subpath}${url.search}`;

  const init: RequestInit = {
    method: request.method,
    headers: {
      "content-type":
        request.headers.get("content-type") || "application/json",
      "user-agent": request.headers.get("user-agent") || "crab-trap-proxy",
    },
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.text();
  }

  try {
    const res = await fetchWithTimeout(target, init, FLEET_TIMEOUT_MS);
    const body = await res.text();
    return new Response(body, {
      status: res.status, // fleet's own status codes pass through
      headers: {
        "Content-Type":
          res.headers.get("content-type") || "application/json; charset=utf-8",
        "X-Fleet-Status": "online",
        "Cache-Control": "no-cache",
        ...cors,
      },
    });
  } catch {
    // asleep / IP changed / timeout — friendly stub, never 502
    return jsonResponse(fleetAsleepStub(`/${subpath}`), 200, {
      "X-Fleet-Status": "asleep",
      "Cache-Control": "no-cache",
      ...cors,
    });
  }
}
