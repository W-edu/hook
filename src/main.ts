import { deleteConfig, getAppForStore, listApps, runSetup, runSetupList } from "./config.ts";
import { getToken, runAuth, runAuthList, runAuthRevoke, runOrgStoreList } from "./auth.ts";
import { keychainDeleteAll, keychainList } from "./keychain.ts";
import { startTunnel } from "./tunnel.ts";
import { deleteWebhooks, fetchAvailableTopics, listWebhooks, pruneStaleWebhooks, registerWebhooks, resolveTopics } from "./shopify.ts";
import { startServer } from "./server.ts";
import { printCompact, printExpanded, startInputHandler } from "./display.ts";

const PORT = 58080;

async function runPrune(store: string): Promise<void> {
  const appEntry = await getAppForStore(store);
  if (!appEntry) {
    console.error(`No app configured for ${store}. Run: hook auth ${store}`);
    Deno.exit(1);
  }

  const token = await getToken(store);
  const pruned = await pruneStaleWebhooks(store, token);
  if (pruned === 0) {
    console.log(`No stale webhooks on ${store}.`);
  } else {
    console.log(`Pruned ${pruned} stale webhook(s) from ${store}.`);
  }
}

async function runList(store: string): Promise<void> {
  const appEntry = await getAppForStore(store);
  if (!appEntry) {
    console.error(`No app configured for ${store}. Run: hook auth ${store}`);
    Deno.exit(1);
  }

  const token = await getToken(store);
  const subs = await listWebhooks(store, token);

  if (subs.length === 0) {
    console.log(`No webhook subscriptions on ${store}.`);
    return;
  }

  console.log(`Webhook subscriptions on ${store}:\n`);
  for (const sub of subs) {
    console.log(`  ${sub.topic.padEnd(40)} ${sub.callbackUrl}`);
  }
}

async function runListen(store: string, topicInput: string, headersOnly: boolean): Promise<void> {
  const appEntry = await getAppForStore(store);
  if (!appEntry) {
    console.error(`No app configured for ${store}. Run: hook auth ${store}`);
    Deno.exit(1);
  }

  const token = await getToken(store);
  const availableTopics = await fetchAvailableTopics(store, token);
  const topics = resolveTopics(topicInput, availableTopics);

  console.log(`App:    ${appEntry.name}`);
  console.log(`Topics: ${topics.join(", ")}`);
  console.log("Starting tunnel...");

  const tunnel = await startTunnel(PORT);
  console.log(`Tunnel: ${tunnel.url}`);

  const callbackUrl = `${tunnel.url}/webhook`;

  const pruned = await pruneStaleWebhooks(store, token);
  if (pruned > 0) console.log(`Pruned ${pruned} stale webhook(s)`);

  console.log("Registering webhooks...");
  const subs = await registerWebhooks(store, token, topics, callbackUrl);
  console.log(`Registered ${subs.length} webhook(s) on ${store}\n`);

  const server = startServer({
    port: PORT,
    clientSecret: appEntry.creds.clientSecret,
    onWebhook: (payload) => {
      printCompact(payload);
      if (headersOnly) printExpanded(payload, true);
    },
  });

  let stopInput: () => void = () => {};
  let cleaningUp = false;
  const cleanup = async () => {
    if (cleaningUp) return;
    cleaningUp = true;
    stopInput();
    console.log("\nCleaning up...");
    await deleteWebhooks(store, token, subs);
    tunnel.close();
    server.close();
    Deno.exit(0);
  };

  const onList = () => {
    console.log(`\nTunnel: ${tunnel.url}`);
    console.log("Active subscriptions:");
    for (const sub of subs) {
      console.log(`  ${sub.topic}`);
    }
    console.log("");
  };

  stopInput = startInputHandler(headersOnly, () => { cleanup(); }, onList);

  Deno.addSignalListener("SIGINT", cleanup);
  Deno.addSignalListener("SIGTERM", cleanup);

  await new Promise<never>(() => {});
}

function usage(): void {
  console.log(`
hook — Shopify webhook interceptor

Usage:
  hook setup [app]                  Add/update a named app (default: "default")
  hook setup list                   List configured apps
  hook orgs list                    List configured orgs
  hook auth <store> [--app <name>]  Authenticate a store via OAuth
  hook auth list                    List authenticated stores
  hook auth revoke <store>          Remove stored token
  hook <org> list                   List authenticated stores for an org
  hook <store> list                 List active webhook subscriptions
  hook <store> prune                Delete stale trycloudflare.com webhooks
  hook <store> <topic>              Listen for webhooks
  hook <store> <topic> --headers-only

Topics:
  orders_create     Exact topic (snake_case → SCREAMING_SNAKE)
  orders_all        All topics for a resource
  products_all      products_create + products_update + products_delete
  ...

Examples:
  hook setup                                  # configure default app
  hook setup acme-org                         # configure named app
  hook auth my-store                          # uses default app
  hook auth other-store --app acme-org
  hook my-store orders_create
  hook my-store orders_all --headers-only
`.trim());
}

function flag(args: string[], name: string): string | null {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : null;
}

async function main(): Promise<void> {
  const args = Deno.args.slice();

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    usage();
    return;
  }

  // hook reset
  if (args[0] === "reset") {
    const [apps, stores] = await Promise.all([listApps(), keychainList()]);
    if (apps.length === 0 && stores.length === 0) {
      console.log("Nothing to reset.");
      return;
    }
    console.log("This will delete:");
    if (apps.length) console.log(`  ${apps.length} app(s): ${apps.map((a) => a.name).join(", ")}`);
    if (stores.length) console.log(`  ${stores.length} keychain token(s): ${stores.join(", ")}`);
    Deno.stdout.writeSync(new TextEncoder().encode('\nType "yes" to confirm: '));
    const buf = new Uint8Array(64);
    const n = await Deno.stdin.read(buf);
    const answer = new TextDecoder().decode(buf.subarray(0, n ?? 0)).trim();
    if (answer !== "yes") {
      console.log("Aborted.");
      return;
    }
    const [deleted] = await Promise.all([keychainDeleteAll(), deleteConfig()]);
    if (deleted.length) console.log(`Removed tokens for: ${deleted.join(", ")}`);
    console.log("Config deleted. hook has been reset.");
    return;
  }

  // hook orgs list
  if (args[0] === "orgs") {
    if (args[1] === "list") {
      await runSetupList();
      return;
    }
    usage();
    Deno.exit(1);
  }

  // hook setup [name | list]
  if (args[0] === "setup") {
    const sub = args[1];
    if (sub === "list") {
      await runSetupList();
      return;
    }
    await runSetup(sub ?? "default");
    return;
  }

  // hook auth ...
  if (args[0] === "auth") {
    const sub = args[1];
    if (!sub || sub === "list") {
      await runAuthList();
      return;
    }
    if (sub === "revoke") {
      const rawRevoke = args[2];
      if (!rawRevoke) { console.error("Usage: hook auth revoke <store>"); Deno.exit(1); }
      const revokeStore = rawRevoke.includes(".") ? rawRevoke : `${rawRevoke}.myshopify.com`;
      await runAuthRevoke(revokeStore);
      return;
    }
    // hook auth <store> [--app <name>]
    const authStore = sub.includes(".") ? sub : `${sub}.myshopify.com`;
    const appName = flag(args, "--app") ?? "default";
    await runAuth(authStore, appName);
    return;
  }

  // hook <store|org> <topic|list> [--headers-only]
  const rawStore = args[0];
  const topicInput = args[1];

  if (!topicInput) {
    usage();
    Deno.exit(1);
  }

  if (topicInput === "list") {
    const apps = await listApps();
    if (apps.some((a) => a.name === rawStore)) {
      await runOrgStoreList(rawStore);
      return;
    }
    const store = rawStore.includes(".") ? rawStore : `${rawStore}.myshopify.com`;
    await runList(store);
    return;
  }

  if (topicInput === "prune") {
    const store = rawStore.includes(".") ? rawStore : `${rawStore}.myshopify.com`;
    await runPrune(store);
    return;
  }

  const store = rawStore.includes(".") ? rawStore : `${rawStore}.myshopify.com`;

  const headersOnly = args.includes("--headers-only");
  await runListen(store, topicInput, headersOnly);
}

main().catch((e) => {
  console.error((e as Error).message);
  Deno.exit(1);
});
