import * as React from "react";
import { useRouter } from "next/router";
import { apiRequest, ApiUser } from "../lib/api";

type Tenant = { id: number; name: string };

type Jar = {
  id: number;
  tenant_id: number;
  name: string;
  version: string;
  storage_key: string;
};

type Job = {
  id: number;
  status: string;
  created_at: string;
  filename?: string | null;
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

export default function AdminPage() {
  const router = useRouter();
  const [user, setUser] = React.useState<ApiUser | null>(null);
  const [tenants, setTenants] = React.useState<Tenant[]>([]);
  const [jars, setJars] = React.useState<Jar[]>([]);
  const [jobs, setJobs] = React.useState<Job[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const [tenantName, setTenantName] = React.useState("");
  const [userEmail, setUserEmail] = React.useState("");
  const [userPassword, setUserPassword] = React.useState("");
  const [userTenantId, setUserTenantId] = React.useState("");

  const [jarTenantId, setJarTenantId] = React.useState("");
  const [jarName, setJarName] = React.useState("");
  const [jarVersion, setJarVersion] = React.useState("");
  const [jarFile, setJarFile] = React.useState<File | null>(null);

  const [activeTenantId, setActiveTenantId] = React.useState("");
  const [activeJarId, setActiveJarId] = React.useState("");
  const [jobsTenantId, setJobsTenantId] = React.useState("");
  const [savingsTenantId, setSavingsTenantId] = React.useState("");
  const [timeSavedMinutes, setTimeSavedMinutes] = React.useState("");
  const [hourlyRate, setHourlyRate] = React.useState("");
  const [summaryTenantId, setSummaryTenantId] = React.useState("");
  const [summary, setSummary] = React.useState<SummaryResponse | null>(null);
  const [usage, setUsage] = React.useState<UsagePoint[]>([]);

  React.useEffect(() => {
    apiRequest<{ user: ApiUser }>("/auth/me")
      .then(({ user }) => {
        if (user.role !== "ADMIN") {
          router.replace("/app");
        } else {
          setUser(user);
          loadTenants();
        }
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  const loadTenants = async () => {
    const data = await apiRequest<{ tenants: Tenant[] }>("/admin/tenants");
    setTenants(data.tenants);
  };

  const loadJars = async (tenantId: string) => {
    if (!tenantId) {
      setJars([]);
      return;
    }
    const data = await apiRequest<{ jars: Jar[] }>(`/admin/jars?tenantId=${tenantId}`);
    setJars(data.jars);
  };

  const loadJobs = async (tenantId: string) => {
    if (!tenantId) {
      setJobs([]);
      return;
    }
    const data = await apiRequest<{ jobs: Job[] }>(`/admin/jobs?tenantId=${tenantId}`);
    setJobs(data.jobs);
  };

  const createTenant = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await apiRequest("/admin/tenants", {
        method: "POST",
        body: JSON.stringify({ name: tenantName })
      });
      setTenantName("");
      await loadTenants();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const createUser = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await apiRequest("/admin/users", {
        method: "POST",
        body: JSON.stringify({
          tenantId: Number(userTenantId),
          email: userEmail,
          password: userPassword,
          role: "USER"
        })
      });
      setUserEmail("");
      setUserPassword("");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const uploadJar = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!jarFile) {
      setError("Select a jar file");
      return;
    }
    setError(null);
    try {
      const form = new FormData();
      form.append("file", jarFile);
      form.append("tenantId", jarTenantId);
      form.append("name", jarName);
      form.append("version", jarVersion);
      await apiRequest("/admin/jars", {
        method: "POST",
        body: form
      });
      await loadJars(jarTenantId);
      setJarName("");
      setJarVersion("");
      setJarFile(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const setActiveJar = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await apiRequest(`/admin/tenants/${activeTenantId}/active-jar`, {
        method: "POST",
        body: JSON.stringify({ jarId: Number(activeJarId) })
      });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const refreshJobs = async (event: React.FormEvent) => {
    event.preventDefault();
    await loadJobs(jobsTenantId);
  };

  const updateSavings = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await apiRequest(`/admin/tenants/${savingsTenantId}/savings`, {
        method: "POST",
        body: JSON.stringify({
          timeSavedMinutes: Number(timeSavedMinutes),
          hourlyRate: Number(hourlyRate)
        })
      });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const loadSummary = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const summaryData = await apiRequest<SummaryResponse>(`/admin/tenants/${summaryTenantId}/summary`);
      const usageData = await apiRequest<{ points: UsagePoint[] }>(`/admin/tenants/${summaryTenantId}/usage`);
      setSummary(summaryData);
      setUsage(usageData.points);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <main>
      <div className="brand">pkba.nl</div>
      <div className="grid">
        <div className="card">
          <h2>Admin control room</h2>
          <p className="status">{user ? `Signed in as ${user.email}` : "Loading..."}</p>
          {error && <div className="notice">{error}</div>}
        </div>

        <div className="card">
          <h3>Create tenant</h3>
          <form className="stack" onSubmit={createTenant}>
            <input
              className="input"
              placeholder="Tenant name"
              value={tenantName}
              onChange={(event) => setTenantName(event.target.value)}
              required
            />
            <button className="button" type="submit">
              Create tenant
            </button>
          </form>
        </div>

        <div className="card">
          <h3>Create user</h3>
          <form className="stack" onSubmit={createUser}>
            <input
              className="input"
              placeholder="Tenant ID"
              value={userTenantId}
              onChange={(event) => setUserTenantId(event.target.value)}
              required
            />
            <input
              className="input"
              placeholder="User email"
              value={userEmail}
              onChange={(event) => setUserEmail(event.target.value)}
              required
            />
            <input
              className="input"
              placeholder="Temporary password"
              value={userPassword}
              onChange={(event) => setUserPassword(event.target.value)}
              required
            />
            <button className="button" type="submit">
              Create user
            </button>
          </form>
        </div>

        <div className="card">
          <h3>Upload jar</h3>
          <form className="stack" onSubmit={uploadJar}>
            <input
              className="input"
              placeholder="Tenant ID"
              value={jarTenantId}
              onChange={(event) => {
                setJarTenantId(event.target.value);
                loadJars(event.target.value);
              }}
              required
            />
            <input
              className="input"
              placeholder="Jar name"
              value={jarName}
              onChange={(event) => setJarName(event.target.value)}
              required
            />
            <input
              className="input"
              placeholder="Jar version"
              value={jarVersion}
              onChange={(event) => setJarVersion(event.target.value)}
              required
            />
            <input
              className="input"
              type="file"
              accept=".jar"
              onChange={(event) => setJarFile(event.target.files?.[0] ?? null)}
              required
            />
            <button className="button" type="submit">
              Upload jar
            </button>
          </form>
          {jars.length > 0 && (
            <div className="status">Latest jars: {jars.map((jar) => `#${jar.id} ${jar.name} ${jar.version}`).join(" · ")}</div>
          )}
        </div>

        <div className="card">
          <h3>Set active jar</h3>
          <form className="stack" onSubmit={setActiveJar}>
            <input
              className="input"
              placeholder="Tenant ID"
              value={activeTenantId}
              onChange={(event) => setActiveTenantId(event.target.value)}
              required
            />
            <input
              className="input"
              placeholder="Jar ID"
              value={activeJarId}
              onChange={(event) => setActiveJarId(event.target.value)}
              required
            />
            <button className="button" type="submit">
              Set active jar
            </button>
          </form>
        </div>

        <div className="card">
          <h3>Recent jobs</h3>
          <form className="stack" onSubmit={refreshJobs}>
            <input
              className="input"
              placeholder="Tenant ID"
              value={jobsTenantId}
              onChange={(event) => setJobsTenantId(event.target.value)}
              required
            />
            <button className="button" type="submit">
              Load jobs
            </button>
          </form>
          {jobs.length > 0 && (
            <div className="stack">
              {jobs.map((job) => (
                <div key={job.id} className="status">
                  #{job.id} {job.status} {job.filename ? `— ${job.filename}` : ""}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3>Usage savings model</h3>
          <p className="status">
            Configure the estimated minutes saved per run and the hourly rate for a tenant.
          </p>
          <form className="stack" onSubmit={updateSavings}>
            <input
              className="input"
              placeholder="Tenant ID"
              value={savingsTenantId}
              onChange={(event) => setSavingsTenantId(event.target.value)}
              required
            />
            <input
              className="input"
              placeholder="Minutes saved per run"
              value={timeSavedMinutes}
              onChange={(event) => setTimeSavedMinutes(event.target.value)}
              required
            />
            <input
              className="input"
              placeholder="Hourly rate (EUR)"
              value={hourlyRate}
              onChange={(event) => setHourlyRate(event.target.value)}
              required
            />
            <button className="button" type="submit">
              Save savings model
            </button>
          </form>
        </div>

        <div className="card">
          <h3>Tenant usage summary</h3>
          <form className="stack" onSubmit={loadSummary}>
            <input
              className="input"
              placeholder="Tenant ID"
              value={summaryTenantId}
              onChange={(event) => setSummaryTenantId(event.target.value)}
              required
            />
            <button className="button" type="submit">
              Load summary
            </button>
          </form>
          {summary && (
            <div className="stack" style={{ marginTop: 12 }}>
              <div className="status">Tool: {summary.toolName ?? "Report generator"}</div>
              <div className="status">Runs completed: {summary.totalRuns}</div>
              <div className="status">
                Savings model: {summary.timeSavedMinutes ?? "-"} min/run · {summary.hourlyRate ?? "-"} EUR/hr
              </div>
              <div className="status">
                Estimated saved: {summary.moneySaved !== null ? `EUR ${summary.moneySaved.toFixed(2)}` : "-"}
              </div>
            </div>
          )}
          {usage.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="status" style={{ marginBottom: 8 }}>Last 14 days usage</div>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${usage.length}, 1fr)`, gap: 6, alignItems: "end", height: 120 }}>
                {usage.map((point) => {
                  const maxRuns = usage.reduce((max, p) => Math.max(max, p.runs), 0);
                  return (
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
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
