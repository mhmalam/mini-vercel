import type { DeploymentStatus } from "@mini-vercel/shared";

export interface Project {
  id: string;
  name: string;
  repo_url: string;
  branch: string;
  port: number;
  created_at: Date;
}

export interface Deployment {
  id: string;
  project_id: string;
  commit_sha: string | null;
  commit_message: string | null;
  status: DeploymentStatus;
  image_tag: string | null;
  container_id: string | null;
  host_port: number | null;
  error: string | null;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
}

export interface BuildLogLine {
  deployment_id: string;
  seq: string; // bigint comes back from pg as a string
  stream: "stdout" | "stderr" | "system";
  line: string;
  at: Date;
}
