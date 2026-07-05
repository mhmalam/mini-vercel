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
import GithubMark from "@/components/GithubMark";
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

  return (
    <>
      <AutoRefresh active={anyInFlight} />

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
            {lastActivity
              ? new Date(lastActivity).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—"}
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
                  {d ? (
                    <Link href={`/deployments/${d.id}`}>
                      <StatusBadge status={d.status} />
                    </Link>
                  ) : (
                    <span className="faint">never deployed</span>
                  )}
                </div>
                {githubSlug(p.repo_url) ? (
                  <a
                    className="repo-pill icon-label"
                    href={`https://github.com/${githubSlug(p.repo_url)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <GithubMark size={12} />
                    {githubSlug(p.repo_url)}
                  </a>
                ) : (
                  <span className="card-repo icon-label" title={p.repo_url}>
                    <GitBranch size={12} />
                    {p.repo_url}
                  </span>
                )}
                <a className="card-url icon-label" href={url} target="_blank" rel="noreferrer">
                  <Globe size={12} />
                  {url.replace(/^https?:\/\//, "")}
                </a>
                {d && (
                  <div className="card-commit">
                    {d.commit_message && (
                      <div className="card-commit-msg icon-label" title={d.commit_message}>
                        <GitCommitHorizontal size={13} />
                        <span className="trunc-line">{d.commit_message}</span>
                      </div>
                    )}
                    <div className="card-commit-when icon-label">
                      {timeAgo(d.created_at)} on <GitBranch size={11} /> {p.branch}
                    </div>
                  </div>
                )}
                <div className="card-actions">
                  <ActionButtons
                    project={p.name}
                    kinds={d?.status === "live" ? ["deploy", "stop"] : ["deploy"]}
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
