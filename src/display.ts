import type { WebhookPayload } from "./server.ts";

const ANSI = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  gray: "\x1b[90m",
};

const RING_SIZE = 20;
const ring: WebhookPayload[] = [];
let lastIndex = -1;

function fmt(d: Date): string {
  return d.toTimeString().slice(0, 8);
}

function kb(bytes: number): string {
  return bytes < 1024 ? `${bytes}b` : `${(bytes / 1024).toFixed(1)}kb`;
}

function topicColor(topic: string): string {
  if (topic.startsWith("ORDERS")) return ANSI.cyan;
  if (topic.startsWith("PRODUCTS")) return ANSI.green;
  if (topic.startsWith("CUSTOMERS")) return ANSI.yellow;
  if (topic.startsWith("INVENTORY")) return ANSI.magenta;
  return ANSI.blue;
}

export function printCompact(payload: WebhookPayload): void {
  ring.push(payload);
  if (ring.length > RING_SIZE) ring.shift();
  lastIndex = ring.length - 1;

  const tc = topicColor(payload.topic);
  const line =
    `${ANSI.gray}[${fmt(payload.receivedAt)}]${ANSI.reset} ` +
    `${tc}${ANSI.bold}${payload.topic.padEnd(36)}${ANSI.reset} ` +
    `${ANSI.dim}${payload.shop.padEnd(40)}${ANSI.reset} ` +
    `${ANSI.gray}(${kb(payload.body.byteLength)})${ANSI.reset}`;

  console.log(line);
}

export function printExpanded(payload: WebhookPayload, headersOnly: boolean): void {
  const divider = `${ANSI.dim}${"─".repeat(72)}${ANSI.reset}`;
  console.log(divider);
  console.log(`${ANSI.bold}Topic:${ANSI.reset}  ${payload.topic}`);
  console.log(`${ANSI.bold}Shop:${ANSI.reset}   ${payload.shop}`);
  console.log(`${ANSI.bold}Time:${ANSI.reset}   ${payload.receivedAt.toISOString()}`);

  const relevantHeaders = [
    "x-shopify-topic",
    "x-shopify-shop-domain",
    "x-shopify-webhook-id",
    "x-shopify-api-version",
    "x-shopify-hmac-sha256",
    "x-shopify-triggered-at",
  ];

  console.log(`\n${ANSI.bold}Headers:${ANSI.reset}`);
  for (const h of relevantHeaders) {
    const v = payload.headers[h];
    if (v) console.log(`  ${ANSI.dim}${h}:${ANSI.reset} ${v}`);
  }

  if (!headersOnly) {
    console.log(`\n${ANSI.bold}Body:${ANSI.reset}`);
    try {
      const json = JSON.parse(new TextDecoder().decode(payload.body));
      console.log(colorJson(json, 0));
    } catch {
      console.log(new TextDecoder().decode(payload.body));
    }
  }

  console.log(divider);
}

export function getLastPayload(): WebhookPayload | null {
  return lastIndex >= 0 ? ring[lastIndex] : null;
}

// Minimal JSON colorizer
function colorJson(val: unknown, depth: number): string {
  const indent = "  ".repeat(depth);
  const inner = "  ".repeat(depth + 1);

  if (val === null) return `${ANSI.dim}null${ANSI.reset}`;
  if (typeof val === "boolean") return `${ANSI.yellow}${val}${ANSI.reset}`;
  if (typeof val === "number") return `${ANSI.cyan}${val}${ANSI.reset}`;
  if (typeof val === "string") return `${ANSI.green}"${val}"${ANSI.reset}`;

  if (Array.isArray(val)) {
    if (val.length === 0) return "[]";
    const items = val.map((v) => `${inner}${colorJson(v, depth + 1)}`).join(",\n");
    return `[\n${items}\n${indent}]`;
  }

  if (typeof val === "object") {
    const entries = Object.entries(val as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    const lines = entries
      .map(([k, v]) => `${inner}${ANSI.blue}"${k}"${ANSI.reset}: ${colorJson(v, depth + 1)}`)
      .join(",\n");
    return `{\n${lines}\n${indent}}`;
  }

  return String(val);
}

export function startInputHandler(headersOnly: boolean): () => void {
  let rawEnabled = false;
  try {
    Deno.stdin.setRaw(true);
    rawEnabled = true;
  } catch {
    // stdin not a tty (e.g. piped) — skip interactive mode
    return () => {};
  }

  const encoder = new TextEncoder();

  console.log(
    `${ANSI.gray}  press ${ANSI.reset}${ANSI.bold}e${ANSI.reset}${ANSI.gray} to expand last · ` +
    `${ANSI.bold}q${ANSI.reset}${ANSI.gray} to quit${ANSI.reset}`,
  );

  const buf = new Uint8Array(8);

  async function read(): Promise<void> {
    while (true) {
      let n: number | null;
      try {
        n = await Deno.stdin.read(buf);
      } catch {
        break;
      }
      if (n === null) break;

      const key = new TextDecoder().decode(buf.subarray(0, n));

      // Ctrl+C / q → exit
      if (key === "\x03" || key.toLowerCase() === "q") {
        Deno.stdout.writeSync(encoder.encode("\n"));
        Deno.exit(0);
      }

      if (key.toLowerCase() === "e") {
        const p = getLastPayload();
        if (p) {
          printExpanded(p, headersOnly);
        } else {
          Deno.stdout.writeSync(encoder.encode("  (no webhooks yet)\n"));
        }
      }
    }
  }

  read();

  return () => {
    if (rawEnabled) {
      try { Deno.stdin.setRaw(false); } catch { /* ignore */ }
    }
  };
}
