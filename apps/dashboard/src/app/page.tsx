import Link from "next/link";
import ActionButtons from "@/components/ActionButtons";
import AutoRefresh from "@/components/AutoRefresh";
import NewProjectForm from "@/components/NewProjectForm";
import StatusBadge from "@/components/StatusBadge";
import { listDeployments, listProjects, publicUrl } from "@/lib/api";
import { listGithubRepos } from "@/lib/github";
import { isInFlight } from "@/lib/status";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [projects, repos] = await Promise.all([listProjects(), listGithubRepos()]);
  const latest = await Promise.all(
    projects.map((p) => listDeployments(p.name, 1).then((ds) => ds[0] ?? null)),
  );
  const anyInFlight = latest.some((d) => d !== null && isInFlight(d.status));
  const liveCount = latest.filter((d) => d?.status === "live").length;
  const failedCount = latest.filter((d) => d?.status === "failed").length;
  const lastActivity = latest
    .filter((d) => d !== null)
    .map((d) => new Date(d.created_at).getTime())
    .sort((a, b) => b - a)[0];

  return (
    <>
      <AutoRefresh active={anyInFlight} />

      <div className="stats">
        <div className="stat">
          <div className="stat-value">{projects.length}</div>
          <div className="stat-label">projects</div>
        </div>
        <div className={`stat ${liveCount > 0 ? "stat-live" : ""}`}>
          <div className="stat-value">{liveCount}</div>
          <div className="stat-label">live</div>
        </div>
        <div className={`stat ${failedCount > 0 ? "stat-failed" : ""}`}>
          <div className="stat-value">{failedCount}</div>
          <div className="stat-label">failed</div>
        </div>
        <div className="stat stat-accent">
          <div className="stat-value">
            {lastActivity
              ? new Date(lastActivity).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—"}
          </div>
          <div className="stat-label">last deploy</div>
        </div>
      </div>

      <div className="page-head">
        <div>
          <h1>projects</h1>
          <p>
            {projects.length === 0
              ? "nothing registered yet — pick a repo below to launch your first project"
              : `${projects.length} registered · name becomes the subdomain`}
          </p>
        </div>
      </div>

      {projects.length > 0 && (
        <div className="panel table-wrap">
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
                      <span className="trunc" title={p.repo_url}>
                        {p.repo_url.replace(/^https:\/\/github\.com\//, "")}
                      </span>{" "}
                      <span className="faint">({p.branch})</span>
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
                      <ActionButtons
                        project={p.name}
                        kinds={
                          d?.status === "live" ? ["deploy", "stop"] : ["deploy"]
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2>register a project</h2>
      <div className="panel panel-pad">
        <NewProjectForm repos={repos} />
      </div>
    </>
  );
}
