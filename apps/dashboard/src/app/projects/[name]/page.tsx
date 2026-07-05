import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, GitBranch, Globe } from "lucide-react";
import LocalTime from "@/components/LocalTime";
import ActionButtons from "@/components/ActionButtons";
import AutoRefresh from "@/components/AutoRefresh";
import EditProject from "@/components/EditProject";
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
  const hasLive = deployments.some((d) => d.status === "live");
  const url = publicUrl(name);

  return (
    <>
      <AutoRefresh active={anyInFlight} />

      <div className="page-head">
        <div>
          <h1>{project.name}</h1>
          <p className="icon-label">
            <GitBranch size={13} />
            <span className="trunc" title={project.repo_url}>
              {project.repo_url.replace(/^https:\/\/github\.com\//, "")}
            </span>{" "}
            <span className="faint">({project.branch})</span>
            <span className="faint">· port {project.port} ·</span>
            <a className="icon-label" href={url} target="_blank" rel="noreferrer">
              <Globe size={13} />
              {url.replace(/^https?:\/\//, "")}
            </a>
            {project.custom_domain?.split(/\s+/).map((d) => (
              <a
                key={d}
                className="icon-label"
                href={`https://${d}`}
                target="_blank"
                rel="noreferrer"
              >
                <Globe size={13} />
                {d}
              </a>
            ))}
          </p>
        </div>
        <span className="head-actions">
          <EditProject
            project={project.name}
            branch={project.branch}
            port={project.port}
            customDomain={project.custom_domain}
          />
          <ActionButtons
            project={project.name}
            kinds={
              hasLive
                ? ["deploy", "rollback", "stop", "remove"]
                : ["deploy", "rollback", "remove"]
            }
            inFlight={anyInFlight}
          />
        </span>
      </div>

      {deployments.length === 0 ? (
        <p className="faint">
          no deployments yet — hit deploy, or run `npx deploy push {project.name}`
        </p>
      ) : (
        <div className="panel table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>deployment</th>
                <th>status</th>
                <th className="col-optional">commit</th>
                <th className="col-optional">created</th>
                <th />
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
                    {d.status === "failed" && d.error && (
                      <span className="error-text"> — {d.error.slice(0, 60)}</span>
                    )}
                  </td>
                  <td className="col-optional">
                    {d.commit_sha ? d.commit_sha.slice(0, 8) : "--------"}
                  </td>
                  <td className="muted col-optional">
                    <LocalTime iso={d.created_at} />
                  </td>
                  <td>
                    <Link className="icon-label" href={`/deployments/${d.id}`}>
                      <FileText size={12} /> logs
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
