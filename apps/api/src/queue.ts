import { Queue } from "bullmq";
import {
  BUILD_QUEUE,
  redisConnectionOptions,
  type BuildJobData,
} from "@mini-vercel/shared";

export const buildQueue = new Queue<BuildJobData, unknown, string>(
  BUILD_QUEUE,
  {
    connection: redisConnectionOptions(),
    defaultJobOptions: {
      attempts: 1, // builds are not idempotent enough to blind-retry
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  },
);
