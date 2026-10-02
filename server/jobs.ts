export interface JobEvent {
  stage: string;
  detail?: Record<string, unknown>;
  at: number;
}

export interface Job<T = unknown> {
  id: string;
  status: "running" | "done" | "error";
  events: JobEvent[];
  result?: T;
  error?: string;
}

export function createJobs() {
  const jobs = new Map<string, Job>();
  const listeners = new Map<string, Set<() => void>>();

  function notify(id: string): void {
    for (const listener of listeners.get(id) ?? []) listener();
  }

  function start<T>(
    run: (progress: (stage: string, detail?: Record<string, unknown>) => void) => Promise<T>,
  ): { id: string } {
    const id = crypto.randomUUID();
    const job: Job<T> = { id, status: "running", events: [] };
    jobs.set(id, job);

    const expiry = setTimeout(() => {
      jobs.delete(id);
      listeners.delete(id);
    }, 30 * 60 * 1000);
    expiry.unref();

    const progress = (stage: string, detail?: Record<string, unknown>) => {
      job.events.push({ stage, ...(detail === undefined ? {} : { detail }), at: Date.now() });
      notify(id);
    };

    void Promise.resolve()
      .then(() => run(progress))
      .then(
        (result) => {
          job.status = "done";
          job.result = result;
          notify(id);
        },
        (error: unknown) => {
          job.status = "error";
          job.error = error instanceof Error ? error.message : String(error);
          notify(id);
        },
      );

    return { id };
  }

  function get(id: string): Job | undefined {
    return jobs.get(id);
  }

  function sseResponse(id: string, req: Request): Response {
    const job = jobs.get(id);
    if (!job) return new Response("Not found", { status: 404 });

    let eventIndex = 0;
    let closed = false;
    let wake: (() => void) | undefined;

    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        const write = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };
        const close = () => {
          if (closed) return;
          closed = true;
          req.signal.removeEventListener("abort", abort);
          listeners.get(id)?.delete(pump);
          controller.close();
        };
        const pump = () => {
          if (closed) return;
          while (eventIndex < job.events.length) write("progress", job.events[eventIndex++]);
          if (job.status === "done") {
            write("done", { result: job.result });
            close();
          } else if (job.status === "error") {
            write("error", { message: job.error });
            close();
          }
        };
        const abort = () => close();
        wake = pump;
        const set = listeners.get(id) ?? new Set<() => void>();
        set.add(pump);
        listeners.set(id, set);
        req.signal.addEventListener("abort", abort, { once: true });
        if (req.signal.aborted) close();
        else pump();
      },
      cancel() {
        closed = true;
        if (wake) listeners.get(id)?.delete(wake);
      },
    });

    return new Response(body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  return { start, get, sseResponse };
}
