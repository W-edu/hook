const SERVICE = "hook-shopify";

export class KeychainError extends Error {
  constructor(public code: "NotFound" | "AccessDenied" | "Unknown", message: string) {
    super(message);
    this.name = "KeychainError";
  }
}

async function run(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const cmd = new Deno.Command("security", { args, stdout: "piped", stderr: "piped" });
  const { code, stdout, stderr } = await cmd.output();
  return {
    code,
    stdout: new TextDecoder().decode(stdout).trim(),
    stderr: new TextDecoder().decode(stderr).trim(),
  };
}

export async function keychainSet(store: string, token: string): Promise<void> {
  const { code, stderr } = await run([
    "add-generic-password",
    "-a", store,
    "-s", SERVICE,
    "-w", token,
    "-U", // update if exists
  ]);
  if (code !== 0) {
    throw new KeychainError("Unknown", `keychain write failed: ${stderr}`);
  }
}

export async function keychainGet(store: string): Promise<string> {
  const { code, stdout, stderr } = await run([
    "find-generic-password",
    "-a", store,
    "-s", SERVICE,
    "-w",
  ]);
  if (code === 44) throw new KeychainError("NotFound", `No token for ${store}`);
  if (code !== 0) throw new KeychainError("Unknown", `keychain read failed: ${stderr}`);
  return stdout;
}

export async function keychainDelete(store: string): Promise<void> {
  const { code, stderr } = await run([
    "delete-generic-password",
    "-a", store,
    "-s", SERVICE,
  ]);
  if (code === 44) throw new KeychainError("NotFound", `No token for ${store}`);
  if (code !== 0) throw new KeychainError("Unknown", `keychain delete failed: ${stderr}`);
}

export async function keychainDeleteAll(): Promise<string[]> {
  const stores = await keychainList();
  for (const store of stores) {
    await keychainDelete(store);
  }
  return stores;
}

export async function keychainList(): Promise<string[]> {
  // Dump all generic passwords for this service and parse account names
  const cmd = new Deno.Command("security", {
    args: ["dump-keychain"],
    stdout: "piped",
    stderr: "piped",
  });
  const { stdout } = await cmd.output();
  const text = new TextDecoder().decode(stdout);

  const stores: string[] = [];
  const blocks = text.split(/(?=keychain: )/);
  for (const block of blocks) {
    if (!block.includes(`"svce"<blob>="${SERVICE}"`)) continue;
    const m = block.match(/"acct"<blob>="([^"]+)"/);
    if (m) stores.push(m[1]);
  }
  return stores;
}
