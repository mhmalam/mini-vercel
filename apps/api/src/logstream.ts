import type { FastifyInstance } from "fastify";
import { TERMINAL_STATUSES } from "@mini-vercel/shared";
import { getBuildLogs, getDeployment } from "@mini-vercel/db";

const POLL_INTERVAL_MS = 1_000;

/**
 * Live build-log streaming over WebSocket (the dashboard's log viewer; the
 * CLI uses it too). On connect the full log so far is replayed as one JSON
 * message per line ({seq, stream, line, at}), new lines are pushed as they
 * land in Postgres, and a final {done: true, status} message is sent once
 * the deployment reaches a terminal status.
 */
export async function logStreamRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>(
    "/api/deployments/:id/logs/stream",
    { websocket: true },
    (socket, req) => {
      const deploymentId = req.params.id;
      let after = 0;
      let timer: NodeJS.Timeout | null = null;
      let closed = false;
      // The pipeline flips the status to terminal and then writes its last
      // few log lines (final URL, prune notes), so poll one extra round
      // after first seeing a terminal status before closing.
      let terminalSeen = false;

      const send = (msg: unknown) => socket.send(JSON.stringify(msg));

      const poll = async () => {
        try {
          const deployment = await getDeployment(deploymentId);
          if (!deployment) {
            send({ error: "deployment not found" });
            return socket.close();
          }
          for (const l of await getBuildLogs(deploymentId, after)) {
            after = Math.max(after, Number(l.seq));
            send({ seq: Number(l.seq), stream: l.stream, line: l.line, at: l.at });
          }
          if (TERMINAL_STATUSES.includes(deployment.status)) {
            if (terminalSeen) {
              send({ done: true, status: deployment.status });
              return socket.close();
            }
            terminalSeen = true;
          }
        } catch (err) {
          req.log.error(err, "log stream poll failed");
          return socket.close();
        }
        if (!closed) timer = setTimeout(poll, POLL_INTERVAL_MS);
      };

      socket.on("close", () => {
        closed = true;
        if (timer) clearTimeout(timer);
      });
      void poll();
    },
  );
}
