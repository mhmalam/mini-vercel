import Link from "next/link";
import { notFound } from "next/navigation";
import AutoRefresh from "@/components/AutoRefresh";
import DeployButton from "@/components/DeployButton";
import StatusBadge from "@/components/StatusBadge";
import { listDeployments, listProjects, publicUrl } from "@/lib/api";
import { isInFlight } from "@/lib/status";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  // The control plane has no GET /api/projects/:name — the list is tiny.
  const projects = await listProjects();
  const project = projects.find((p) => p.name === name);
  if (!project) notFound();

  const deployments = await listDeployments(name, 50);
  const anyInFlight = deployments.some((d) => isInFlight(d.status));
  const url = publicUrl(name);

  return (
    <>
      <AutoRefresh active={anyInFlight} />

      <div className="page-head">
        <div>
          <h1>{project.name}</h1>
          <p>
            {project.repo_url} <span className="faint">({project.branch})</span>
            {" · container port "}
            {project.port}
            {" · "}
            <a href={url} target="_blank" rel="noreferrer">
              {url.replace(/^https?:\/\//, "")}
            </a>
          </p>
        </div>
        <DeployButton project={project.name} />
      </div>

      {deployments.length === 0 ? (
        <p className="faint">
          no deployments yet — hit deploy, or run `npx deploy push {project.name}`
        </p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>deployment</th>
                <th>status</th>
                <th>commit</th>
                <th>created</th>
                <th>host port</th>
              </tr>
            </thead>
            <tbody>
              {deployments.map((d) => (
                <tr key={d.id}>
                  <td>
                    <Link href={`/deployments/${d.id}`}>{d.id.slice(0, 8)}</Link>
                  </td>
                  <td>
                    <StatusBadge status={d.status} />
                  </td>
                  <td>{d.commit_sha ? d.commit_sha.slice(0, 8) : "--------"}</td>
                  <td className="muted">
                    {new Date(d.created_at).toLocaleString()}
                  </td>
                  <td>{d.host_port ?? <span className="faint">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
