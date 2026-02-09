import * as React from "react";
import { useRouter } from "next/router";
import { apiRequest, API_BASE, ApiUser } from "../lib/api";

type JobResponse = {
  job: {
    id: number;
    status: "queued" | "running" | "done" | "failed";
    progress: number;
    error_message?: string | null;
  };
  report: {
    id: number;
    filename: string;
    mime_type: string;
    size_bytes: number;
  } | null;
};

export default function AppPage() {
  const router = useRouter();
  const [user, setUser] = React.useState<ApiUser | null>(null);
  const [jobId, setJobId] = React.useState<number | null>(null);
  const [jobStatus, setJobStatus] = React.useState<JobResponse["job"] | null>(null);
  const [report, setReport] = React.useState<JobResponse["report"] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [downloaded, setDownloaded] = React.useState(false);
  const pollRef = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    apiRequest<{ user: ApiUser }>("/auth/me")
      .then(({ user }) => {
        if (user.role === "ADMIN") {
          router.replace("/admin");
        } else {
          setUser(user);
        }
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  React.useEffect(() => {
    if (!jobId) {
      return;
    }

    pollRef.current = setInterval(async () => {
      try {
        const data = await apiRequest<JobResponse>(`/reports/jobs/${jobId}`);
        setJobStatus(data.job);
        setReport(data.report);
        if (data.job.status === "done" || data.job.status === "failed") {
          if (pollRef.current) {
            clearInterval(pollRef.current);
          }
        }
      } catch (err) {
        setError((err as Error).message);
      }
    }, 2000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [jobId]);

  const runReport = async () => {
    setError(null);
    setDownloaded(false);
    setReport(null);
    setJobStatus(null);
    try {
      const data = await apiRequest<{ jobId: number }>("/reports/run", { method: "POST" });
      setJobId(data.jobId);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const downloadReport = async () => {
    if (!jobId) {
      return;
    }
    setError(null);
    try {
      const data = await apiRequest<{ token: string }>(`/reports/jobs/${jobId}/download-token`, {
        method: "POST"
      });
      setDownloaded(true);
      window.location.href = `${API_BASE}/reports/download/${data.token}`;
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <main>
      <div className="brand">pkba.nl</div>
      <div className="card" style={{ maxWidth: 640 }}>
        <div className="badge">Tenant report console</div>
        <h2>Generate your report</h2>
        <p className="status">
          {user ? `Signed in as ${user.email}` : "Loading account..."}
        </p>
        {error && <div className="notice">{error}</div>}
        <div className="stack">
          <button className="button" onClick={runReport} disabled={!user}>
            Generate report
          </button>
          <div className="status">
            Status: {jobStatus ? jobStatus.status : "idle"}
            {jobStatus?.status === "failed" && jobStatus.error_message ? ` — ${jobStatus.error_message}` : ""}
          </div>
          {report && (
            <div className="status">
              Output: {report.filename} ({Math.round(report.size_bytes / 1024)} KB)
            </div>
          )}
          <button
            className="button"
            onClick={downloadReport}
            disabled={!report || downloaded || jobStatus?.status !== "done"}
          >
            {downloaded ? "Downloaded" : "Download (one-time)"}
          </button>
          {downloaded && (
            <div className="status">Downloaded. Generate a new report to download again.</div>
          )}
        </div>
      </div>
    </main>
  );
}
