import { getAppForStore, runSetup, runSetupList } from "./config.ts";
import { getToken, runAuth, runAuthList, runAuthRevoke } from "./auth.ts";
import { startTunnel } from "./tunnel.ts";
import { deleteWebhooks, registerWebhooks, resolveTopics } from "./shopify.ts";
import { startServer } from "./server.ts";
import { printCompact, printExpanded, startInputHandler } from "./display.ts";

const PORT = 58080;

async function runListen(store: string, topicInput: string, headersOnly: boolean): Promise<void> {
  const appEntry = await getAppForStore(store);
  if (!appEntry) {
    console.error(`No app configured for ${store}. Run: hook auth ${store}`);
    Deno.exit(1);
  }

  const token = await getToken(store);
  const topics = resolveTopics(topicInput);

  console.log(`App:    ${appEntry.name}`);
  console.log(`Topics: ${topics.join(", ")}`);
  console.log("Starting tunnel...");

  const tunnel = await startTunnel(PORT);
  console.log(`Tunnel: ${tunnel.url}`);

  const callbackUrl = `${tunnel.url}/webhook`;

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

  const stopInput = startInputHandler(headersOnly);

  const cleanup = async () => {
    stopInput();
    console.log("\nCleaning up...");
    await deleteWebhooks(store, token, subs);
    tunnel.close();
    server.close();
    Deno.exit(0);
  };

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
  hook auth <store> [--app <name>]  Authenticate a store via OAuth
  hook auth list                    List authenticated stores
  hook auth revoke <store>          Remove stored token
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
  hook auth my-store.myshopify.com            # uses default app
  hook auth other-store.myshopify.com --app acme-org
  hook my-store.myshopify.com orders_create
  hook my-store.myshopify.com orders_all --headers-only
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
      const store = args[2];
      if (!store) { console.error("Usage: hook auth revoke <store>"); Deno.exit(1); }
      await runAuthRevoke(store);
      return;
    }
    // hook auth <store> [--app <name>]
    const appName = flag(args, "--app") ?? "default";
    await runAuth(sub, appName);
    return;
  }

  // hook <store> <topic> [--headers-only]
  const store = args[0];
  const topicInput = args[1];

  if (!store || !topicInput) {
    usage();
    Deno.exit(1);
  }

  const headersOnly = args.includes("--headers-only");
  await runListen(store, topicInput, headersOnly);
}

main().catch((e) => {
  console.error((e as Error).message);
  Deno.exit(1);
});
