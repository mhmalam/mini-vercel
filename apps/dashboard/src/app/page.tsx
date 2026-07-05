import Link from "next/link";
import AutoRefresh from "@/components/AutoRefresh";
import DeployButton from "@/components/DeployButton";
import NewProjectForm from "@/components/NewProjectForm";
import StatusBadge from "@/components/StatusBadge";
import { listDeployments, listProjects, publicUrl } from "@/lib/api";
import { isInFlight } from "@/lib/status";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const projects = await listProjects();
  const latest = await Promise.all(
    projects.map((p) => listDeployments(p.name, 1).then((ds) => ds[0] ?? null)),
  );
  const anyInFlight = latest.some((d) => d !== null && isInFlight(d.status));

  return (
    <>
      <AutoRefresh active={anyInFlight} />

      <div className="page-head">
        <div>
          <h1>projects</h1>
          <p>
            {projects.length === 0
              ? "nothing registered yet"
              : `${projects.length} registered · name becomes the subdomain`}
          </p>
        </div>
      </div>

      {projects.length > 0 && (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>project</th>
                <th>repo</th>
                <th>latest</th>
                <th>url</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {projects.map((p, i) => {
                const d = latest[i];
                const url = publicUrl(p.name);
                return (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/projects/${encodeURIComponent(p.name)}`}>
                        {p.name}
                      </Link>
                    </td>
                    <td className="grow muted">
                      {p.repo_url} <span className="faint">({p.branch})</span>
                    </td>
                    <td>
                      {d ? (
                        <Link href={`/deployments/${d.id}`}>
                          <StatusBadge status={d.status} />
                        </Link>
                      ) : (
                        <span className="faint">never deployed</span>
                      )}
                    </td>
                    <td>
                      <a href={url} target="_blank" rel="noreferrer">
                        {url.replace(/^https?:\/\//, "")}
                      </a>
                    </td>
                    <td>
                      <DeployButton project={p.name} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2>register a project</h2>
      <NewProjectForm />
    </>
  );
}
