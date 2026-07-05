import { appendBuildLog, type BuildLogLine } from "@mini-vercel/db";

/**
 * Ordered, sequenced writer for a deployment's build log. Inserts are
 * chained on a single promise so lines land in Postgres in the order they
 * were emitted even though the stream handlers are synchronous.
 */
export class LogSink {
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly deploymentId: string) {}

  write(stream: BuildLogLine["stream"], line: string): void {
    this.tail = this.tail.then(() =>
      appendBuildLog(this.deploymentId, stream, line).catch((err) => {
        // Losing a log line must not fail the build itself.
        console.error(`failed to persist log line:`, err);
      }),
    );
  }

  system(line: string): void {
    this.write("system", line);
  }

  /** Wait for all pending inserts to land. */
  flush(): Promise<void> {
    return this.tail;
  }
}
