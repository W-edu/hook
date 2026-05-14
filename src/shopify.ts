const TOPIC_INTROSPECTION = `{ __type(name: "WebhookSubscriptionTopic") { enumValues { name } } }`;

export async function fetchAvailableTopics(store: string, token: string): Promise<string[]> {
  const data = await gql(store, token, TOPIC_INTROSPECTION) as {
    __type: { enumValues: Array<{ name: string }> };
  };
  return data.__type.enumValues.map((v) => v.name);
}

export function resolveTopics(input: string, availableTopics: string[]): string[] {
  const normalized = input.toUpperCase();

  // Exact match
  if (availableTopics.includes(normalized)) return [normalized];

  // _ALL suffix: derive group from prefix, e.g. orders_all → all ORDERS_* topics
  if (normalized.endsWith("_ALL")) {
    const prefix = normalized.slice(0, -4); // "ORDERS"
    const group = availableTopics.filter((t) => t.startsWith(`${prefix}_`));
    if (group.length > 0) return group;
    const known = [...new Set(availableTopics.map((t) => t.split("_")[0].toLowerCase()))].join(", ");
    throw new Error(`Unknown resource "${prefix.toLowerCase()}". Known: ${known}`);
  }

  throw new Error(`Unknown topic "${input}". Use snake_case (orders_create) or resource_all (orders_all)`);
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
    let result: { webhookSubscription: { id: string } | null; userErrors: { message: string }[] };
    try {
      const data = await gql(store, token, CREATE_WEBHOOK, { topic, callbackUrl }) as {
        webhookSubscriptionCreate: typeof result;
      };
      result = data.webhookSubscriptionCreate;
    } catch (e) {
      console.warn(`  Skipped ${topic}: ${(e as Error).message}`);
      continue;
    }
    if (result.userErrors.length) {
      console.warn(`  Skipped ${topic}: ${result.userErrors.map((e) => e.message).join(", ")}`);
      continue;
    }
    subs.push({ id: result.webhookSubscription!.id, topic });
  }

  if (subs.length === 0) {
    throw new Error("No webhooks could be registered.");
  }

  return subs;
}

const LIST_WEBHOOKS = `
  query {
    webhookSubscriptions(first: 100) {
      edges {
        node { id topic endpoint { __typename ... on WebhookHttpEndpoint { callbackUrl } } }
      }
    }
  }
`;

export async function listWebhooks(store: string, token: string): Promise<Array<{ id: string; topic: string; callbackUrl: string }>> {
  const data = await gql(store, token, LIST_WEBHOOKS) as {
    webhookSubscriptions: {
      edges: Array<{
        node: { id: string; topic: string; endpoint: { callbackUrl?: string } };
      }>;
    };
  };
  return data.webhookSubscriptions.edges.map(({ node }) => ({
    id: node.id,
    topic: node.topic,
    callbackUrl: node.endpoint.callbackUrl ?? "(unknown)",
  }));
}

export async function pruneStaleWebhooks(store: string, token: string): Promise<number> {
  const all = await listWebhooks(store, token);
  const TUNNEL_DOMAINS = [".trycloudflare.com", ".loca.lt"];
  const stale = all.filter((s) => TUNNEL_DOMAINS.some((d) => s.callbackUrl.includes(d)));
  await deleteWebhooks(store, token, stale);
  return stale.length;
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

const APP_ORG_QUERY = `{ currentAppInstallation { app { developerName } } }`;

export async function fetchAppOrgName(store: string, token: string): Promise<string | null> {
  try {
    const data = await gql(store, token, APP_ORG_QUERY) as {
      currentAppInstallation: { app: { developerName: string | null } };
    };
    return data.currentAppInstallation?.app?.developerName ?? null;
  } catch {
    return null;
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
