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

type SummaryResponse = {
  toolName: string | null;
  totalRuns: number;
  timeSavedMinutes: number | null;
  hourlyRate: number | null;
  moneySaved: number | null;
};

type UsagePoint = {
  day: string;
  runs: number;
};

export default function AppPage() {
  const router = useRouter();
  const [user, setUser] = React.useState<ApiUser | null>(null);
  const [jobId, setJobId] = React.useState<number | null>(null);
  const [jobStatus, setJobStatus] = React.useState<JobResponse["job"] | null>(null);
  const [report, setReport] = React.useState<JobResponse["report"] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [downloaded, setDownloaded] = React.useState(false);
  const [summary, setSummary] = React.useState<SummaryResponse | null>(null);
  const [usage, setUsage] = React.useState<UsagePoint[]>([]);
  const pollRef = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    apiRequest<{ user: ApiUser }>("/auth/me")
      .then(({ user }) => {
        if (user.role === "ADMIN") {
          router.replace("/admin");
        } else {
          setUser(user);
          apiRequest<SummaryResponse>("/reports/summary")
            .then((data) => setSummary(data))
            .catch(() => setSummary(null));
          apiRequest<{ points: UsagePoint[] }>("/reports/usage")
            .then((data) => setUsage(data.points))
            .catch(() => setUsage([]));
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
          if (data.job.status === "done") {
            apiRequest<SummaryResponse>("/reports/summary")
              .then((summary) => setSummary(summary))
              .catch(() => setSummary(null));
            apiRequest<{ points: UsagePoint[] }>("/reports/usage")
              .then((data) => setUsage(data.points))
              .catch(() => setUsage([]));
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

  const moneySaved = summary?.moneySaved !== null && summary?.moneySaved !== undefined
    ? summary.moneySaved.toFixed(2)
    : null;

  const maxRuns = usage.reduce((max, point) => Math.max(max, point.runs), 0);

  return (
    <main>
      <div className="brand">pkba.nl</div>
      <div className="card" style={{ maxWidth: 640 }}>
        <div className="badge">Tenant report console</div>
        <h2>Generate your report</h2>
        <p className="status">
          {user ? `Signed in as ${user.email}` : "Loading account..."}
        </p>
        {summary && (
          <div className="status">
            Tool access: {summary.toolName ?? "Report generator"} · Runs: {summary.totalRuns}
            {moneySaved ? ` · Saved: EUR ${moneySaved}` : ""}
          </div>
        )}
        {usage.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div className="status" style={{ marginBottom: 8 }}>Last 14 days usage</div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${usage.length}, 1fr)`, gap: 6, alignItems: "end", height: 120 }}>
              {usage.map((point) => (
                <div key={point.day} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <div
                    style={{
                      width: "100%",
                      height: maxRuns > 0 ? `${Math.max(8, Math.round((point.runs / maxRuns) * 100))}%` : "8%",
                      background: "rgba(215, 100, 65, 0.6)",
                      borderRadius: 6
                    }}
                    title={`${point.day}: ${point.runs} runs`}
                  />
                  <div style={{ fontSize: 10, color: "#6b6f6c" }}>{point.day.slice(5)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
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
