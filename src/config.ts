import { join } from "https://deno.land/std@0.224.0/path/mod.ts";
import { ensureDir } from "https://deno.land/std@0.224.0/fs/mod.ts";

export interface AppCredentials {
  clientId: string;
  clientSecret: string;
}

interface Config {
  apps: Record<string, AppCredentials>;
  storeApps: Record<string, string>; // store domain → app name
}

function configPath(): string {
  const home = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE") ?? ".";
  return join(home, ".config", "hook", "config.json");
}

async function readRaw(): Promise<Config> {
  try {
    const raw = await Deno.readTextFile(configPath());
    const parsed = JSON.parse(raw);
    return {
      apps: parsed.apps ?? {},
      storeApps: parsed.storeApps ?? {},
    };
  } catch {
    return { apps: {}, storeApps: {} };
  }
}

async function writeRaw(config: Config): Promise<void> {
  const path = configPath();
  await ensureDir(join(path, ".."));
  await Deno.writeTextFile(path, JSON.stringify(config, null, 2));
}

export async function getApp(name: string): Promise<AppCredentials | null> {
  const config = await readRaw();
  return config.apps[name] ?? null;
}

export async function getAppForStore(store: string): Promise<{ name: string; creds: AppCredentials } | null> {
  const config = await readRaw();
  const appName = config.storeApps[store] ?? "default";
  const creds = config.apps[appName];
  if (!creds) return null;
  return { name: appName, creds };
}

export async function setStoreApp(store: string, appName: string): Promise<void> {
  const config = await readRaw();
  config.storeApps[store] = appName;
  await writeRaw(config);
}

export async function listApps(): Promise<Array<{ name: string; clientId: string }>> {
  const config = await readRaw();
  return Object.entries(config.apps).map(([name, { clientId }]) => ({ name, clientId }));
}

export async function listStoreApps(): Promise<Array<{ store: string; app: string }>> {
  const config = await readRaw();
  return Object.entries(config.storeApps).map(([store, app]) => ({ store, app }));
}

async function prompt(message: string, hidden = false): Promise<string> {
  if (hidden) {
    const stty = new Deno.Command("stty", { args: ["-echo"], stdin: "inherit", stdout: "inherit", stderr: "inherit" });
    await stty.output();
  }
  Deno.stdout.writeSync(new TextEncoder().encode(message));
  const buf = new Uint8Array(1024);
  const n = await Deno.stdin.read(buf);
  if (hidden) {
    const stty = new Deno.Command("stty", { args: ["echo"], stdin: "inherit", stdout: "inherit", stderr: "inherit" });
    await stty.output();
    Deno.stdout.writeSync(new TextEncoder().encode("\n"));
  }
  return new TextDecoder().decode(buf.subarray(0, n ?? 0)).trim();
}

export async function runSetup(appName = "default"): Promise<void> {
  console.log(`Shopify app credentials for "${appName}" (Partner Dashboard → App → Client credentials)\n`);
  const clientId = await prompt("Client ID:     ");
  const clientSecret = await prompt("Client secret: ", true);

  if (!clientId || !clientSecret) {
    console.error("Aborted — both fields required.");
    Deno.exit(1);
  }

  const config = await readRaw();
  config.apps[appName] = { clientId, clientSecret };
  await writeRaw(config);
  console.log(`App "${appName}" saved to ${configPath()}`);
}

export async function runSetupList(): Promise<void> {
  const apps = await listApps();
  if (apps.length === 0) {
    console.log('No apps configured. Run "hook setup" first.');
    return;
  }
  console.log("Configured apps:");
  for (const { name, clientId } of apps) {
    console.log(`  ${name.padEnd(20)} client_id: ${clientId}`);
  }
}
