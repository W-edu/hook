import { getApp, listStoreApps, setAppOrgName, setStoreApp } from "./config.ts";
import { keychainDelete, keychainGet, keychainList, keychainSet } from "./keychain.ts";
import { startServer } from "./server.ts";
import { fetchAppOrgName } from "./shopify.ts";

const PORT = 57432;
const SCOPES = [
  "read_orders", "read_products", "read_customers",
  "read_inventory", "read_fulfillments", "read_draft_orders",
  "read_checkouts", "read_price_rules",
].join(",");

export async function runAuth(store: string, appName = "default"): Promise<void> {
  const creds = await getApp(appName);
  if (!creds) {
    console.error(`No credentials for app "${appName}". Run: hook setup ${appName === "default" ? "" : appName}`);
    Deno.exit(1);
  }

  const state = crypto.randomUUID();
  const redirectUri = `http://localhost:${PORT}/callback`;

  const authUrl =
    `https://${store}/admin/oauth/authorize` +
    `?client_id=${creds.clientId}` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}`;

  console.log(`Opening browser for ${store} (app: ${appName})...`);

  let resolveToken!: (token: string) => void;
  let rejectToken!: (err: Error) => void;
  const tokenPromise = new Promise<string>((res, rej) => { resolveToken = res; rejectToken = rej; });

  const server = startServer({
    port: PORT,
    clientSecret: creds.clientSecret,
    onOAuthCallback: async (params) => {
      const returnedState = params.get("state");
      const code = params.get("code");

      if (returnedState !== state) {
        rejectToken(new Error("State mismatch — possible CSRF"));
        return new Response("State mismatch", { status: 400 });
      }
      if (!code) {
        rejectToken(new Error("No code in OAuth callback"));
        return new Response("Missing code", { status: 400 });
      }

      try {
        const token = await exchangeCode(store, creds.clientId, creds.clientSecret, code);
        resolveToken(token);
        return new Response(
          "<html><body><h2>Authenticated! You can close this tab.</h2></body></html>",
          { headers: { "content-type": "text/html" } },
        );
      } catch (e) {
        rejectToken(e as Error);
        return new Response("Token exchange failed", { status: 500 });
      }
    },
  });

  await openBrowser(authUrl);

  try {
    const token = await Promise.race([
      tokenPromise,
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("OAuth timed out after 120s")), 120_000)
      ),
    ]);

    await keychainSet(store, token);
    await setStoreApp(store, appName);

    const existingCreds = await getApp(appName);
    if (existingCreds && !existingCreds.orgName) {
      const orgName = await fetchAppOrgName(store, token);
      if (orgName) {
        await setAppOrgName(appName, orgName);
        console.log(`Org: ${orgName}`);
      }
    }

    console.log(`Token saved for ${store} (app: ${appName})`);
  } finally {
    server.close();
  }
}

async function exchangeCode(store: string, clientId: string, clientSecret: string, code: string): Promise<string> {
  const res = await fetch(`https://${store}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  const json = await res.json() as { access_token?: string };
  if (!json.access_token) throw new Error("No access_token in response");
  return json.access_token;
}

async function openBrowser(url: string): Promise<void> {
  const cmd = Deno.build.os === "darwin" ? "open" : "xdg-open";
  await new Deno.Command(cmd, { args: [url] }).output();
}

export async function runAuthList(): Promise<void> {
  const [keychainStores, storeApps] = await Promise.all([keychainList(), listStoreApps()]);
  const appMap = Object.fromEntries(storeApps.map(({ store, app }) => [store, app]));

  if (keychainStores.length === 0) {
    console.log("No authenticated stores.");
    return;
  }

  console.log("Authenticated stores:");
  for (const store of keychainStores) {
    const app = appMap[store] ?? "default";
    console.log(`  ${store.padEnd(45)} app: ${app}`);
  }
}

export async function runOrgStoreList(orgName: string): Promise<void> {
  const [keychainStores, storeApps] = await Promise.all([keychainList(), listStoreApps()]);
  const appMap = Object.fromEntries(storeApps.map(({ store, app }) => [store, app]));

  const stores = keychainStores.filter((store) => (appMap[store] ?? "default") === orgName);

  if (stores.length === 0) {
    console.log(`No authenticated stores for org "${orgName}".`);
    return;
  }

  console.log(`Stores under "${orgName}":`);
  for (const store of stores) {
    console.log(`  ${store}`);
  }
}

export async function runAuthRevoke(store: string): Promise<void> {
  await keychainDelete(store);
  console.log(`Token revoked for ${store}`);
}

export async function getToken(store: string): Promise<string> {
  try {
    return await keychainGet(store);
  } catch {
    console.error(`No token for ${store}. Run: hook auth ${store}`);
    Deno.exit(1);
  }
}
