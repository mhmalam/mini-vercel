import Link from "next/link";
import { notFound } from "next/navigation";
import ActionButtons from "@/components/ActionButtons";
import AutoRefresh from "@/components/AutoRefresh";
import LogViewer from "@/components/LogViewer";
import StatusBadge from "@/components/StatusBadge";
import { ApiError, getDeployment, listProjects, type Deployment } from "@/lib/api";
import { isInFlight } from "@/lib/status";

export const dynamic = "force-dynamic";

export default async function DeploymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let deployment: Deployment;
  try {
    deployment = await getDeployment(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const projects = await listProjects();
  const project = projects.find((p) => p.id === deployment.project_id);

  return (
    <>
      <AutoRefresh active={isInFlight(deployment.status)} />

      <div className="page-head">
        <div>
          <h1>
            deployment {deployment.id.slice(0, 8)}{" "}
            <StatusBadge status={deployment.status} />
          </h1>
          <p className="faint">{deployment.id}</p>
        </div>
        {project && (
          <ActionButtons
            project={project.name}
            kinds={
              deployment.status === "live"
                ? ["deploy", "rollback", "stop"]
                : ["deploy", "rollback"]
            }
          />
        )}
      </div>

      <div className="panel panel-pad">
        <dl className="meta">
        {project && (
          <>
            <dt>project</dt>
            <dd>
              <Link href={`/projects/${encodeURIComponent(project.name)}`}>
                {project.name}
              </Link>
            </dd>
          </>
        )}
        <dt>commit</dt>
        <dd>{deployment.commit_sha ?? <span className="faint">not resolved yet</span>}</dd>
        <dt>created</dt>
        <dd>{new Date(deployment.created_at).toLocaleString()}</dd>
        {deployment.finished_at && (
          <>
            <dt>finished</dt>
            <dd>{new Date(deployment.finished_at).toLocaleString()}</dd>
          </>
        )}
        {deployment.host_port !== null && (
          <>
            <dt>host port</dt>
            <dd>{deployment.host_port}</dd>
          </>
        )}
        {deployment.error && (
          <>
            <dt className="error-text">error</dt>
            <dd className="error-text">{deployment.error}</dd>
          </>
        )}
        </dl>
      </div>

      <h2>build log</h2>
      <div className="term">
        <div className="term-bar">
          build · {deployment.id.slice(0, 8)}
        </div>
        <LogViewer deploymentId={deployment.id} initialStatus={deployment.status} />
      </div>
    </>
  );
}
