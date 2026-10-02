import { expect, test } from "bun:test";
import { createJobs } from "../server/jobs.ts";

test("streams progress in order followed by the result", async () => {
  const jobs = createJobs();
  let finish!: (value: string) => void;
  const pending = new Promise<string>((resolve) => {
    finish = resolve;
  });
  const { id } = jobs.start(async (progress) => {
    progress("prepare", { step: 1 });
    progress("render", { step: 2 });
    return pending;
  });
  const response = jobs.sseResponse(id, new Request("http://localhost/events"));

  await Promise.resolve();
  finish("complete");
  const text = await response.text();

  expect(text.indexOf('"stage":"prepare"')).toBeLessThan(text.indexOf('"stage":"render"'));
  expect(text).toContain('event: done\ndata: {"result":"complete"}');
});

test("streams rejecting jobs as error events", async () => {
  const jobs = createJobs();
  let reject!: (reason: Error) => void;
  const pending = new Promise<never>((_resolve, rejectPromise) => {
    reject = rejectPromise;
  });
  const { id } = jobs.start(() => pending);
  const response = jobs.sseResponse(id, new Request("http://localhost/events"));

  await Promise.resolve();
  reject(new Error("job failed"));

  expect(await response.text()).toContain('event: error\ndata: {"message":"job failed"}');
});
