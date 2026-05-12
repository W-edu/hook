// Webhook topic groups — keys are the user-facing resource prefix
export const TOPIC_GROUPS: Record<string, string[]> = {
  orders: [
    "ORDERS_CREATE", "ORDERS_UPDATED", "ORDERS_CANCELLED",
    "ORDERS_FULFILLED", "ORDERS_PAID", "ORDERS_PARTIALLY_FULFILLED",
    "ORDERS_REFUNDED",
  ],
  products: ["PRODUCTS_CREATE", "PRODUCTS_UPDATE", "PRODUCTS_DELETE"],
  customers: ["CUSTOMERS_CREATE", "CUSTOMERS_UPDATE", "CUSTOMERS_DELETE", "CUSTOMERS_MERGE"],
  inventory: [
    "INVENTORY_ITEMS_CREATE", "INVENTORY_ITEMS_UPDATE", "INVENTORY_ITEMS_DELETE",
    "INVENTORY_LEVELS_CONNECT", "INVENTORY_LEVELS_UPDATE", "INVENTORY_LEVELS_DISCONNECT",
  ],
  fulfillments: [
    "FULFILLMENTS_CREATE", "FULFILLMENTS_UPDATE",
    "FULFILLMENT_ORDERS_FULFILLMENT_REQUESTED", "FULFILLMENT_ORDERS_CANCELLATION_REQUESTED",
  ],
  checkouts: ["CHECKOUTS_CREATE", "CHECKOUTS_UPDATE", "CHECKOUTS_DELETE"],
  carts: ["CARTS_CREATE", "CARTS_UPDATE"],
  draft_orders: ["DRAFT_ORDERS_CREATE", "DRAFT_ORDERS_UPDATE", "DRAFT_ORDERS_DELETE"],
  collections: ["COLLECTIONS_CREATE", "COLLECTIONS_UPDATE", "COLLECTIONS_DELETE"],
  refunds: ["REFUNDS_CREATE"],
  disputes: ["DISPUTES_CREATE", "DISPUTES_REDACTED"],
  app: ["APP_SUBSCRIPTIONS_UPDATE", "APP_PURCHASES_ONE_TIME_UPDATE"],
};

// All topics flat
const ALL_TOPICS = Object.values(TOPIC_GROUPS).flat();

export function resolveTopics(input: string): string[] {
  const normalized = input.toUpperCase();

  // Exact match
  if (ALL_TOPICS.includes(normalized)) return [normalized];

  // _ALL suffix: e.g. orders_all → all ORDERS_* topics
  if (normalized.endsWith("_ALL")) {
    const prefix = normalized.slice(0, -4).toLowerCase(); // "orders"
    const group = TOPIC_GROUPS[prefix];
    if (group) return group;
    throw new Error(`Unknown resource "${prefix}". Known: ${Object.keys(TOPIC_GROUPS).join(", ")}`);
  }

  throw new Error(`Unknown topic "${input}". Example: orders_create, orders_all`);
}

// ---- GraphQL helpers ----

async function gql(store: string, token: string, query: string, variables: Record<string, unknown> = {}): Promise<unknown> {
  const res = await fetch(`https://${store}/admin/api/2024-10/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) throw new Error(`Shopify API error ${res.status}: ${await res.text()}`);

  const json = await res.json() as { data?: unknown; errors?: unknown[] };
  if (json.errors?.length) throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  return json.data;
}

const CREATE_WEBHOOK = `
  mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $callbackUrl: URL!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: { callbackUrl: $callbackUrl, format: JSON }) {
      webhookSubscription { id legacyResourceId }
      userErrors { field message }
    }
  }
`;

const DELETE_WEBHOOK = `
  mutation webhookSubscriptionDelete($id: ID!) {
    webhookSubscriptionDelete(id: $id) {
      deletedWebhookSubscriptionId
      userErrors { field message }
    }
  }
`;

export interface WebhookSubscription {
  id: string;
  topic: string;
}

export async function registerWebhooks(
  store: string,
  token: string,
  topics: string[],
  callbackUrl: string,
): Promise<WebhookSubscription[]> {
  const subs: WebhookSubscription[] = [];
  for (const topic of topics) {
    const data = await gql(store, token, CREATE_WEBHOOK, { topic, callbackUrl }) as {
      webhookSubscriptionCreate: { webhookSubscription: { id: string }; userErrors: { message: string }[] };
    };
    const result = data.webhookSubscriptionCreate;
    if (result.userErrors.length) {
      throw new Error(`Failed to register ${topic}: ${result.userErrors.map((e) => e.message).join(", ")}`);
    }
    subs.push({ id: result.webhookSubscription.id, topic });
  }
  return subs;
}

export async function deleteWebhooks(store: string, token: string, subs: WebhookSubscription[]): Promise<void> {
  for (const sub of subs) {
    try {
      await gql(store, token, DELETE_WEBHOOK, { id: sub.id });
    } catch (e) {
      console.error(`  Warning: could not delete webhook ${sub.topic}: ${(e as Error).message}`);
    }
  }
}

// ---- HMAC verification ----

export async function verifyHmac(body: Uint8Array, hmacHeader: string, clientSecret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(clientSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const buf = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
  const sig = await crypto.subtle.sign("HMAC", key, buf);
  const computed = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return computed === hmacHeader;
}
