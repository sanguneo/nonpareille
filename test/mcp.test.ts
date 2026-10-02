import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createDotMcpServer } from "../mcp/server.ts";

async function connect(): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([createDotMcpServer().connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown>): Promise<string> {
  const result = await client.callTool({ name, arguments: args });
  const content = result.content as { type: string; text: string }[];
  if (result.isError) throw new Error(content[0]!.text);
  return content[0]!.text;
}

const gridRows = (dottext: string) => dottext.split("\n").slice(dottext.split("\n").indexOf("@grid") + 1);

test("draw_line draws the diagonal and undo clears it", async () => {
  const client = await connect();
  const { docId } = JSON.parse(await call(client, "canvas_new", { width: 8, height: 8, palette: ["#000000"] }));
  expect(JSON.parse(await call(client, "draw_line", { docId, x0: 0, y0: 0, x1: 7, y1: 7, key: "A" }))).toEqual({ changed: 8 });
  expect(gridRows(await call(client, "get_grid", { docId, format: "dottext" }))).toEqual(
    Array.from({ length: 8 }, (_, y) => ".".repeat(y) + "A" + ".".repeat(7 - y)),
  );
  await call(client, "undo", { docId });
  expect(gridRows(await call(client, "get_grid", { docId, format: "dottext" }))).toEqual(Array(8).fill("........"));
  await client.close();
});
