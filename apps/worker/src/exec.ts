import { spawn } from "node:child_process";
import readline from "node:readline";

export interface ExecOptions {
  cwd?: string;
  timeoutMs?: number;
  /** Called once per line of output as it streams. */
  onLine?: (stream: "stdout" | "stderr", line: string) => void;
}

export class ExecError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number | null,
    public readonly timedOut: boolean,
  ) {
    super(message);
  }
}

/**
 * Run a command (no shell — args are passed verbatim, so no quoting issues
 * on Windows) and stream its output line by line. Resolves with combined
 * stdout when the command exits 0; throws ExecError otherwise.
 */
export function exec(
  cmd: string,
  args: string[],
  opts: ExecOptions = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, windowsHide: true });

    let timedOut = false;
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill();
        }, opts.timeoutMs)
      : null;

    const stdoutChunks: string[] = [];

    readline
      .createInterface({ input: child.stdout })
      .on("line", (line) => {
        stdoutChunks.push(line);
        opts.onLine?.("stdout", line);
      });
    readline
      .createInterface({ input: child.stderr })
      .on("line", (line) => opts.onLine?.("stderr", line));

    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(
        new ExecError(`failed to start ${cmd}: ${err.message}`, null, false),
      );
    });

    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (timedOut) {
        reject(
          new ExecError(
            `${cmd} timed out after ${opts.timeoutMs}ms`,
            code,
            true,
          ),
        );
      } else if (code !== 0) {
        reject(new ExecError(`${cmd} exited with code ${code}`, code, false));
      } else {
        resolve(stdoutChunks.join("\n"));
      }
    });
  });
}
