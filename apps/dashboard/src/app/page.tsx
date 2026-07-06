import Link from "next/link";
import {
  Activity,
  CircleAlert,
  Clock,
  FolderGit2,
  GitBranch,
  GitCommitHorizontal,
  Globe,
} from "lucide-react";
import ActionButtons from "@/components/ActionButtons";
import EditProject from "@/components/EditProject";
import GithubMark from "@/components/GithubMark";
import LocalTime from "@/components/LocalTime";
import AutoRefresh from "@/components/AutoRefresh";
import NewProjectForm from "@/components/NewProjectForm";
import StatusBadge from "@/components/StatusBadge";
import { listDeployments, listProjects, publicUrl } from "@/lib/api";
import { listGithubRepos } from "@/lib/github";
import { githubSlug, isInFlight, timeAgo } from "@/lib/status";

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

  const inFlight = projects
    .map((p, i) => ({ project: p, d: latest[i] }))
    .filter((x) => x.d !== null && isInFlight(x.d.status));

  return (
    <>
      <AutoRefresh active={anyInFlight} />

      {inFlight.map(({ project, d }) => (
        <Link
          key={d!.id}
          className="activity-banner"
          href={`/deployments/${d!.id}`}
        >
          <span className={`badge st-${d!.status}`}>{d!.status}</span>
          <span className="activity-text">
            <strong>{project.name}</strong>
            {d!.commit_message ? ` — ${d!.commit_message}` : ""}
          </span>
          <span className="activity-cta">watch logs →</span>
        </Link>
      ))}

      <div className="stats">
        <div className="stat">
          <div className="stat-value">{projects.length}</div>
          <div className="stat-label icon-label">
            <FolderGit2 size={13} /> projects
          </div>
        </div>
        <div className={`stat ${liveCount > 0 ? "stat-live" : ""}`}>
          <div className="stat-value">{liveCount}</div>
          <div className="stat-label icon-label">
            <Activity size={13} /> live
          </div>
        </div>
        <div className={`stat ${failedCount > 0 ? "stat-failed" : ""}`}>
          <div className="stat-value">{failedCount}</div>
          <div className="stat-label icon-label">
            <CircleAlert size={13} /> failed
          </div>
        </div>
        <div className="stat stat-accent">
          <div className="stat-value">
            {lastActivity ? (
              <LocalTime iso={new Date(lastActivity).toISOString()} mode="time" />
            ) : (
              "—"
            )}
          </div>
          <div className="stat-label icon-label">
            <Clock size={13} /> last deploy
          </div>
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
        <div className="cards">
          {projects.map((p, i) => {
            const d = latest[i];
            const url = publicUrl(p.name);
            return (
              <div className="card" key={p.id}>
                <div className="card-top">
                  <Link
                    className="card-name"
                    href={`/projects/${encodeURIComponent(p.name)}`}
                  >
                    {p.name}
                  </Link>
                  <span className="card-top-side">
                    <EditProject
                      project={p.name}
                      branch={p.branch}
                      port={p.port}
                      customDomain={p.custom_domain}
                    />
                    {d ? (
                      <Link href={`/deployments/${d.id}`}>
                        <StatusBadge status={d.status} />
                      </Link>
                    ) : (
                      <span className="faint">never deployed</span>
                    )}
                  </span>
                </div>
                {githubSlug(p.repo_url) ? (
                  <a
                    className="repo-pill icon-label"
                    href={`https://github.com/${githubSlug(p.repo_url)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <GithubMark size={12} />
                    <span className="t">{githubSlug(p.repo_url)}</span>
                  </a>
                ) : (
                  <span className="repo-pill icon-label" title={p.repo_url}>
                    <GitBranch size={12} />
                    <span className="t">{p.repo_url}</span>
                  </span>
                )}
                <a className="card-url icon-label" href={url} target="_blank" rel="noreferrer">
                  <Globe size={12} />
                  <span className="t">{url.replace(/^https?:\/\//, "")}</span>
                </a>
                <div className="card-commit">
                  <div className="card-commit-msg icon-label" title={d?.commit_message ?? ""}>
                    <GitCommitHorizontal size={13} />
                    <span className="t">
                      {d?.commit_message ?? (
                        <span className="faint">
                          {d ? "no commit message" : "waiting for first deploy"}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="card-commit-when icon-label">
                    {d ? (
                      <>
                        {timeAgo(d.created_at)} on <GitBranch size={11} /> {p.branch}
                      </>
                    ) : (
                      <>
                        <GitBranch size={11} /> {p.branch}
                      </>
                    )}
                  </div>
                </div>
                <div className="card-actions">
                  <ActionButtons
                    project={p.name}
                    kinds={d?.status === "live" ? ["deploy", "stop"] : ["deploy"]}
                    inFlight={d !== null && isInFlight(d.status)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <h2>register a project</h2>
      <div className="panel panel-pad">
        <NewProjectForm repos={repos} />
      </div>
    </>
  );
}
