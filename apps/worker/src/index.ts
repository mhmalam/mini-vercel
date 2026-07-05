import { Worker } from "bullmq";
import {
  BUILD_QUEUE,
  redisConnectionOptions,
  type BuildJobData,
} from "@mini-vercel/shared";
import { runDeployment } from "./pipeline.js";

// One build at a time: docker build is heavy and this runs on a single box.
const worker = new Worker<BuildJobData, void, string>(
  BUILD_QUEUE,
  async (job) => {
    console.log(`[worker] starting deployment ${job.data.deploymentId}`);
    await runDeployment(job.data.deploymentId);
    console.log(`[worker] finished deployment ${job.data.deploymentId}`);
  },
  { connection: redisConnectionOptions(), concurrency: 1 },
);

worker.on("failed", (job, err) => {
  console.error(`[worker] deployment ${job?.data.deploymentId} failed:`, err.message);
});

worker.on("error", (err) => {
  console.error("[worker] queue error:", err.message);
});

console.log(`[worker] listening on queue '${BUILD_QUEUE}'`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    console.log(`[worker] ${signal} received, shutting down...`);
    await worker.close();
    process.exit(0);
  });
}
