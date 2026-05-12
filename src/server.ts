import { verifyHmac } from "./shopify.ts";

export interface WebhookPayload {
  topic: string;
  shop: string;
  headers: Record<string, string>;
  body: Uint8Array;
  receivedAt: Date;
}

export type WebhookHandler = (payload: WebhookPayload) => void;
export type OAuthCallbackHandler = (params: URLSearchParams) => Promise<Response>;

export interface ServerOptions {
  port: number;
  clientSecret: string;
  onWebhook?: WebhookHandler;
  onOAuthCallback?: OAuthCallbackHandler;
}

export interface Server {
  port: number;
  close: () => void;
}

export function startServer(opts: ServerOptions): Server {
  const ac = new AbortController();

  const handler = async (req: Request): Promise<Response> => {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/callback") {
      if (opts.onOAuthCallback) return opts.onOAuthCallback(url.searchParams);
      return new Response("No OAuth handler", { status: 500 });
    }

    if (req.method === "POST" && url.pathname === "/webhook") {
      const body = new Uint8Array(await req.arrayBuffer());
      const hmac = req.headers.get("x-shopify-hmac-sha256") ?? "";

      const valid = await verifyHmac(body, hmac, opts.clientSecret);
      if (!valid) return new Response("Unauthorized", { status: 401 });

      const headers: Record<string, string> = {};
      req.headers.forEach((v, k) => { headers[k] = v; });

      opts.onWebhook?.({
        topic: req.headers.get("x-shopify-topic") ?? "unknown",
        shop: req.headers.get("x-shopify-shop-domain") ?? "unknown",
        headers,
        body,
        receivedAt: new Date(),
      });

      return new Response("OK", { status: 200 });
    }

    return new Response("Not Found", { status: 404 });
  };

  Deno.serve({ port: opts.port, signal: ac.signal, onListen: () => {} }, handler);

  return {
    port: opts.port,
    close: () => ac.abort(),
  };
}
