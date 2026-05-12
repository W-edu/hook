import localtunnel from "npm:localtunnel@2.0.2";

export interface Tunnel {
  url: string;
  close: () => void;
}

export async function startTunnel(port: number): Promise<Tunnel> {
  const lt = await localtunnel({ port });
  return {
    url: lt.url,
    close: () => lt.close(),
  };
}
