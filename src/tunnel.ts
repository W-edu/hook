export interface Tunnel {
  url: string;
  close: () => void;
}

export async function startTunnel(port: number): Promise<Tunnel> {
  const proc = new Deno.Command("cloudflared", {
    args: ["tunnel", "--url", `localhost:${port}`],
    stdout: "null",
    stderr: "piped",
  }).spawn();

  const url = await readTunnelUrl(proc.stderr);
  drainSilently(proc.stderr);

  return {
    url,
    close: () => proc.kill(),
  };
}

async function readTunnelUrl(stderr: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stderr.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) throw new Error("cloudflared exited before tunnel URL was found — is it installed? brew install cloudflared");
    buffer += decoder.decode(value, { stream: true });
    const match = buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match) {
      reader.releaseLock();
      return match[0];
    }
  }
}

function drainSilently(readable: ReadableStream<Uint8Array>): void {
  (async () => {
    const reader = readable.getReader();
    try {
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    } catch { /* ignore */ }
  })();
}
