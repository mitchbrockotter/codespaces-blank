import * as React from "react";
import { useRouter } from "next/router";
import { apiRequest, ApiUser } from "../lib/api";

type Tenant = { id: number; name: string; created_at?: string };

type TenantUser = {
  id: number;
  tenantId: number;
  email: string;
  role: "ADMIN" | "USER";
  isActive: boolean;
  createdAt: string;
};

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
  loginCount?: number;
  dataUsedBytes?: number;
  dataUsedLabel?: string;
  lastLoginAt?: string | null;
};

type UsagePoint = {
  day: string;
  runs: number;
};

type AdminOverviewTenant = {
  id: number;
  name: string;
  createdAt: string;
  totalRuns: number;
  loginCount: number;
  dataUsedBytes: number;
  dataUsedLabel: string;
  estimatedPlanCostEur: number;
  lastLoginAt: string | null;
};

type AdminOverviewResponse = {
  planPriceEur: number;
  totalEnvironments: number;
  totalDataUsedBytes: number;
  totalDataUsedLabel: string;
  totalEstimatedCostEur: number;
  tenants: AdminOverviewTenant[];
};

export default function AdminPage() {
  const router = useRouter();
  const [user, setUser] = React.useState<ApiUser | null>(null);
  const [tenants, setTenants] = React.useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = React.useState("");
  const [showInactiveUsers, setShowInactiveUsers] = React.useState(false);

  const [tenantUsers, setTenantUsers] = React.useState<TenantUser[]>([]);
  const [jars, setJars] = React.useState<Jar[]>([]);
  const [jobs, setJobs] = React.useState<Job[]>([]);
  const [summary, setSummary] = React.useState<SummaryResponse | null>(null);
  const [usage, setUsage] = React.useState<UsagePoint[]>([]);
  const [overview, setOverview] = React.useState<AdminOverviewResponse | null>(null);

  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);

  const [tenantName, setTenantName] = React.useState("");
  const [environmentName, setEnvironmentName] = React.useState("");
  const [environmentEmail, setEnvironmentEmail] = React.useState("");
  const [environmentPassword, setEnvironmentPassword] = React.useState("");

  const [userEmail, setUserEmail] = React.useState("");
  const [userPassword, setUserPassword] = React.useState("");
  const [userRole, setUserRole] = React.useState<"ADMIN" | "USER">("USER");

  const [jarName, setJarName] = React.useState("");
  const [jarVersion, setJarVersion] = React.useState("");
  const [jarFile, setJarFile] = React.useState<File | null>(null);

  const [activeJarId, setActiveJarId] = React.useState("");

  const [timeSavedMinutes, setTimeSavedMinutes] = React.useState("");
  const [hourlyRate, setHourlyRate] = React.useState("");

  const [roleDraftByUser, setRoleDraftByUser] = React.useState<Record<number, "ADMIN" | "USER">>({});
  const [resetPasswordByUser, setResetPasswordByUser] = React.useState<Record<number, string>>({});

  const selectedTenant = React.useMemo(
    () => tenants.find((tenant) => String(tenant.id) === selectedTenantId) ?? null,
    [tenants, selectedTenantId]
  );

  const maxRuns = usage.reduce((max, point) => Math.max(max, point.runs), 0);

  const loadTenants = React.useCallback(async () => {
    const data = await apiRequest<{ tenants: Tenant[] }>("/admin/tenants");
    setTenants(data.tenants);
    if (!selectedTenantId && data.tenants.length > 0) {
      setSelectedTenantId(String(data.tenants[0].id));
    }
  }, [selectedTenantId]);

  const loadOverview = React.useCallback(async () => {
    const data = await apiRequest<AdminOverviewResponse>("/admin/overview");
    setOverview(data);
  }, []);

  const loadTenantUsers = React.useCallback(async (tenantId: string, includeInactive: boolean) => {
    if (!tenantId) {
      setTenantUsers([]);
      return;
    }
    const data = await apiRequest<{ users: TenantUser[] }>(`/admin/tenants/${tenantId}/users?includeInactive=${includeInactive}`);
    setTenantUsers(data.users);
    const roleDraft: Record<number, "ADMIN" | "USER"> = {};
    data.users.forEach((entry) => {
      roleDraft[entry.id] = entry.role;
    });
    setRoleDraftByUser(roleDraft);
  }, []);

  const loadJars = React.useCallback(async (tenantId: string) => {
    if (!tenantId) {
      setJars([]);
      return;
    }
    const data = await apiRequest<{ jars: Jar[] }>(`/admin/jars?tenantId=${tenantId}`);
    setJars(data.jars);
  }, []);

  const loadJobs = React.useCallback(async (tenantId: string) => {
    if (!tenantId) {
      setJobs([]);
      return;
    }
    const data = await apiRequest<{ jobs: Job[] }>(`/admin/jobs?tenantId=${tenantId}`);
    setJobs(data.jobs);
  }, []);

  const loadSummaryAndUsage = React.useCallback(async (tenantId: string) => {
    if (!tenantId) {
      setSummary(null);
      setUsage([]);
      return;
    }
    const [summaryData, usageData] = await Promise.all([
      apiRequest<SummaryResponse>(`/admin/tenants/${tenantId}/summary`),
      apiRequest<{ points: UsagePoint[] }>(`/admin/tenants/${tenantId}/usage`)
    ]);
    setSummary(summaryData);
    setUsage(usageData.points);
  }, []);

  const refreshAll = React.useCallback(async () => {
    setError(null);
    await Promise.all([
      loadTenants(),
      loadOverview(),
      selectedTenantId ? loadTenantUsers(selectedTenantId, showInactiveUsers) : Promise.resolve(),
      selectedTenantId ? loadJars(selectedTenantId) : Promise.resolve(),
      selectedTenantId ? loadJobs(selectedTenantId) : Promise.resolve(),
      selectedTenantId ? loadSummaryAndUsage(selectedTenantId) : Promise.resolve()
    ]);
  }, [loadJars, loadJobs, loadOverview, loadSummaryAndUsage, loadTenantUsers, loadTenants, selectedTenantId, showInactiveUsers]);

  React.useEffect(() => {
    apiRequest<{ user: ApiUser }>("/auth/me")
      .then(({ user: authenticatedUser }) => {
        if (authenticatedUser.role !== "ADMIN") {
          router.replace("/app");
          return;
        }

        setUser(authenticatedUser);
        refreshAll().catch((err) => setError((err as Error).message));
      })
      .catch(() => router.replace("/login"));
  }, [refreshAll, router]);

  React.useEffect(() => {
    if (!selectedTenantId) {
      setTenantUsers([]);
      setJars([]);
      setJobs([]);
      setSummary(null);
      setUsage([]);
      return;
    }

    Promise.all([
      loadTenantUsers(selectedTenantId, showInactiveUsers),
      loadJars(selectedTenantId),
      loadJobs(selectedTenantId),
      loadSummaryAndUsage(selectedTenantId)
    ]).catch((err) => setError((err as Error).message));
  }, [loadJars, loadJobs, loadSummaryAndUsage, loadTenantUsers, selectedTenantId, showInactiveUsers]);

  const logout = async () => {
    setError(null);
    setNotice(null);
    setIsLoggingOut(true);
    try {
      await apiRequest<{ ok: true }>("/auth/logout", { method: "POST" });
      router.replace("/login");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoggingOut(false);
    }
  };

  const createTenant = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const data = await apiRequest<{ tenant: Tenant }>("/admin/tenants", {
        method: "POST",
        body: JSON.stringify({ name: tenantName })
      });
      setTenantName("");
      setSelectedTenantId(String(data.tenant.id));
      setNotice(`Tenant aangemaakt: ${data.tenant.name}`);
      await refreshAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const createEnvironment = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const result = await apiRequest<{ tenant: Tenant; user: { id: number; email: string } }>("/admin/environments", {
        method: "POST",
        body: JSON.stringify({
          environmentName,
          email: environmentEmail,
          password: environmentPassword
        })
      });
      setEnvironmentName("");
      setEnvironmentEmail("");
      setEnvironmentPassword("");
      setSelectedTenantId(String(result.tenant.id));
      setNotice(`Omgeving aangemaakt: ${result.tenant.name} (${result.user.email})`);
      await refreshAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const createUser = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedTenantId) {
      setError("Selecteer eerst een omgeving");
      return;
    }

    setError(null);
    setNotice(null);
    try {
      await apiRequest("/admin/users", {
        method: "POST",
        body: JSON.stringify({
          tenantId: Number(selectedTenantId),
          email: userEmail,
          password: userPassword,
          role: userRole
        })
      });
      setUserEmail("");
      setUserPassword("");
      setUserRole("USER");
      setNotice("Gebruiker aangemaakt");
      await refreshAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const uploadJar = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedTenantId) {
      setError("Selecteer eerst een omgeving");
      return;
    }
    if (!jarFile) {
      setError("Selecteer een jar-bestand");
      return;
    }

    setError(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.append("file", jarFile);
      form.append("tenantId", selectedTenantId);
      form.append("name", jarName);
      form.append("version", jarVersion);
      await apiRequest("/admin/jars", {
        method: "POST",
        body: form
      });
      setJarName("");
      setJarVersion("");
      setJarFile(null);
      setNotice("Jar geupload");
      await refreshAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const setActiveJar = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedTenantId) {
      setError("Selecteer eerst een omgeving");
      return;
    }

    setError(null);
    setNotice(null);
    try {
      await apiRequest(`/admin/tenants/${selectedTenantId}/active-jar`, {
        method: "POST",
        body: JSON.stringify({ jarId: Number(activeJarId) })
      });
      setNotice("Actieve jar ingesteld");
      await refreshAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const updateSavings = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedTenantId) {
      setError("Selecteer eerst een omgeving");
      return;
    }

    setError(null);
    setNotice(null);
    try {
      await apiRequest(`/admin/tenants/${selectedTenantId}/savings`, {
        method: "POST",
        body: JSON.stringify({
          timeSavedMinutes: Number(timeSavedMinutes),
          hourlyRate: Number(hourlyRate)
        })
      });
      setNotice("Besparingsmodel opgeslagen");
      await refreshAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const saveUserRole = async (tenantUser: TenantUser) => {
    const nextRole = roleDraftByUser[tenantUser.id] ?? tenantUser.role;
    if (nextRole === tenantUser.role) {
      setNotice(`Geen wijziging voor ${tenantUser.email}`);
      return;
    }

    setError(null);
    setNotice(null);
    try {
      await apiRequest(`/admin/users/${tenantUser.id}`, {
        method: "PATCH",
        body: JSON.stringify({ role: nextRole })
      });
      setNotice(`Rol bijgewerkt voor ${tenantUser.email}`);
      await refreshAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const resetUserPassword = async (tenantUser: TenantUser) => {
    const nextPassword = (resetPasswordByUser[tenantUser.id] || "").trim();
    if (nextPassword.length < 8) {
      setError("Nieuw wachtwoord moet minimaal 8 tekens hebben");
      return;
    }

    setError(null);
    setNotice(null);
    try {
      await apiRequest(`/admin/users/${tenantUser.id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ newPassword: nextPassword })
      });
      setResetPasswordByUser((current) => ({ ...current, [tenantUser.id]: "" }));
      setNotice(`Wachtwoord gereset voor ${tenantUser.email}`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const setUserStatus = async (tenantUser: TenantUser, isActive: boolean) => {
    setError(null);
    setNotice(null);
    try {
      await apiRequest(`/admin/users/${tenantUser.id}/status`, {
        method: "POST",
        body: JSON.stringify({ isActive })
      });
      setNotice(isActive ? `Gebruiker geactiveerd: ${tenantUser.email}` : `Gebruiker gedeactiveerd: ${tenantUser.email}`);
      await refreshAll();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const useTenantFromOverview = (tenantId: number) => {
    setSelectedTenantId(String(tenantId));
    setError(null);
    setNotice(`Context ingesteld op tenant #${tenantId}`);
  };

  return (
    <>
      <nav className="navbar">
        <div className="navbar-container">
          <div className="navbar-left">
            <a href="/" className="navbar-brand">
              <img src="/images/logo.png" alt="P&K Backend Automation Logo" className="navbar-logo" />
              <span>P&K Backend Automation</span>
            </a>
          </div>
          <div className="navbar-right">
            <a href="/" className="nav-link">Home</a>
            <a href="/contact" className="nav-link">Contact</a>
            <a href="/admin" className="nav-link">Admin</a>
            {user ? <span className="user-display">Ingelogd als {user.email}</span> : null}
            <button className="nav-link nav-login nav-link-button" type="button" onClick={logout} disabled={isLoggingOut}>
              {isLoggingOut ? "Uitloggen..." : "Uitloggen"}
            </button>
          </div>
        </div>
      </nav>

      <main>
        <div className="brand">Admin overzicht</div>

        <div className="card" style={{ marginBottom: 20 }}>
          <h2>Admin control room</h2>
          <p className="status">{user ? `Ingelogd als ${user.email}` : "Laden..."}</p>
          <div className="stack" style={{ marginTop: 12 }}>
            <label className="label" htmlFor="selected-tenant">Actieve omgeving</label>
            <select
              id="selected-tenant"
              className="input"
              value={selectedTenantId}
              onChange={(event) => setSelectedTenantId(event.target.value)}
            >
              <option value="">Selecteer omgeving</option>
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  #{tenant.id} - {tenant.name}
                </option>
              ))}
            </select>
            <label className="status" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={showInactiveUsers}
                onChange={(event) => setShowInactiveUsers(event.target.checked)}
              />
              Toon ook gedeactiveerde gebruikers
            </label>
            <button className="button" type="button" onClick={() => refreshAll().catch((err) => setError((err as Error).message))}>
              Alles verversen
            </button>
          </div>
          {selectedTenant ? <p className="status" style={{ marginTop: 10 }}>Actief: #{selectedTenant.id} - {selectedTenant.name}</p> : null}
          {error ? <div className="notice" style={{ marginTop: 10 }}>{error}</div> : null}
          {notice ? <div className="notice" style={{ marginTop: 10 }}>{notice}</div> : null}
        </div>

        <div className="grid">
          <div className="card">
            <h3>Omgevingen en kosten</h3>
            <p className="status">Verdeling op basis van dataverbruik binnen het Railway EUR {overview?.planPriceEur.toFixed(2) ?? "5.00"} plan.</p>
            <div className="status" style={{ marginBottom: 10 }}>
              Omgevingen: {overview?.totalEnvironments ?? 0} · Data totaal: {overview?.totalDataUsedLabel ?? "0 B"}
            </div>
            {overview?.tenants?.length ? (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e8dace" }}>Omgeving</th>
                      <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e8dace" }}>Data</th>
                      <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e8dace" }}>Runs</th>
                      <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e8dace" }}>Logins</th>
                      <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e8dace" }}>Laatste login</th>
                      <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e8dace" }}>Kosten</th>
                      <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e8dace" }}>Actie</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.tenants.map((tenant) => (
                      <tr key={tenant.id}>
                        <td style={{ padding: "10px 8px", borderBottom: "1px solid #f1e7de" }}>#{tenant.id} {tenant.name}</td>
                        <td style={{ padding: "10px 8px", borderBottom: "1px solid #f1e7de" }}>{tenant.dataUsedLabel}</td>
                        <td style={{ padding: "10px 8px", borderBottom: "1px solid #f1e7de" }}>{tenant.totalRuns}</td>
                        <td style={{ padding: "10px 8px", borderBottom: "1px solid #f1e7de" }}>{tenant.loginCount}</td>
                        <td style={{ padding: "10px 8px", borderBottom: "1px solid #f1e7de" }}>
                          {tenant.lastLoginAt ? new Date(tenant.lastLoginAt).toLocaleString() : "-"}
                        </td>
                        <td style={{ padding: "10px 8px", borderBottom: "1px solid #f1e7de" }}>EUR {tenant.estimatedPlanCostEur.toFixed(2)}</td>
                        <td style={{ padding: "10px 8px", borderBottom: "1px solid #f1e7de" }}>
                          <button className="button" type="button" onClick={() => useTenantFromOverview(tenant.id)}>Gebruik</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="status">Nog geen omgevingen gevonden.</div>
            )}
          </div>

          <div className="card">
            <h3>Gebruikersbeheer actieve omgeving</h3>
            {selectedTenant ? <p className="status">Omgeving: {selectedTenant.name}</p> : null}
            {tenantUsers.length ? (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e8dace" }}>Gebruiker</th>
                      <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e8dace" }}>Rol</th>
                      <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e8dace" }}>Status</th>
                      <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e8dace" }}>Nieuw wachtwoord</th>
                      <th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e8dace" }}>Acties</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenantUsers.map((tenantUser) => (
                      <tr key={tenantUser.id}>
                        <td style={{ padding: "10px 8px", borderBottom: "1px solid #f1e7de" }}>
                          {tenantUser.email}
                          <div className="status">Aangemaakt: {new Date(tenantUser.createdAt).toLocaleDateString()}</div>
                        </td>
                        <td style={{ padding: "10px 8px", borderBottom: "1px solid #f1e7de" }}>
                          <select
                            className="input"
                            value={roleDraftByUser[tenantUser.id] ?? tenantUser.role}
                            onChange={(event) => setRoleDraftByUser((current) => ({
                              ...current,
                              [tenantUser.id]: event.target.value as "ADMIN" | "USER"
                            }))}
                          >
                            <option value="USER">USER</option>
                            <option value="ADMIN">ADMIN</option>
                          </select>
                        </td>
                        <td style={{ padding: "10px 8px", borderBottom: "1px solid #f1e7de" }}>
                          {tenantUser.isActive ? "Actief" : "Gedeactiveerd"}
                        </td>
                        <td style={{ padding: "10px 8px", borderBottom: "1px solid #f1e7de" }}>
                          <input
                            className="input"
                            type="password"
                            placeholder="Minimaal 8 tekens"
                            value={resetPasswordByUser[tenantUser.id] ?? ""}
                            onChange={(event) => setResetPasswordByUser((current) => ({
                              ...current,
                              [tenantUser.id]: event.target.value
                            }))}
                          />
                        </td>
                        <td style={{ padding: "10px 8px", borderBottom: "1px solid #f1e7de" }}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button className="button" type="button" onClick={() => saveUserRole(tenantUser)}>Rol opslaan</button>
                            <button className="button" type="button" onClick={() => resetUserPassword(tenantUser)}>Reset wachtwoord</button>
                            {tenantUser.isActive ? (
                              <button className="button" type="button" onClick={() => setUserStatus(tenantUser, false)}>Deactiveer</button>
                            ) : (
                              <button className="button" type="button" onClick={() => setUserStatus(tenantUser, true)}>Activeer</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="status">Nog geen gebruikers in deze omgeving.</div>
            )}
          </div>

          <div className="card">
            <h3>Nieuwe omgeving</h3>
            <p className="status">Maakt tenant + eerste user in 1 actie.</p>
            <form className="stack" onSubmit={createEnvironment}>
              <input className="input" placeholder="Omgevingsnaam" value={environmentName} onChange={(event) => setEnvironmentName(event.target.value)} required />
              <input className="input" placeholder="E-mail van eerste gebruiker" value={environmentEmail} onChange={(event) => setEnvironmentEmail(event.target.value)} required />
              <input className="input" placeholder="Tijdelijk wachtwoord" value={environmentPassword} onChange={(event) => setEnvironmentPassword(event.target.value)} required minLength={8} />
              <button className="button" type="submit">Omgeving aanmaken</button>
            </form>
          </div>

          <div className="card">
            <h3>Tenant los aanmaken</h3>
            <form className="stack" onSubmit={createTenant}>
              <input className="input" placeholder="Tenant naam" value={tenantName} onChange={(event) => setTenantName(event.target.value)} required />
              <button className="button" type="submit">Tenant aanmaken</button>
            </form>
          </div>

          <div className="card">
            <h3>Gebruiker toevoegen aan actieve omgeving</h3>
            <form className="stack" onSubmit={createUser}>
              <input className="input" placeholder="Gebruiker e-mail" value={userEmail} onChange={(event) => setUserEmail(event.target.value)} required />
              <input className="input" placeholder="Tijdelijk wachtwoord" value={userPassword} onChange={(event) => setUserPassword(event.target.value)} required minLength={8} />
              <select className="input" value={userRole} onChange={(event) => setUserRole(event.target.value as "ADMIN" | "USER") }>
                <option value="USER">USER</option>
                <option value="ADMIN">ADMIN</option>
              </select>
              <button className="button" type="submit" disabled={!selectedTenantId}>Gebruiker aanmaken</button>
            </form>
          </div>

          <div className="card">
            <h3>Jar beheer (actieve omgeving)</h3>
            <form className="stack" onSubmit={uploadJar}>
              <input className="input" placeholder="Jar naam" value={jarName} onChange={(event) => setJarName(event.target.value)} required />
              <input className="input" placeholder="Jar versie" value={jarVersion} onChange={(event) => setJarVersion(event.target.value)} required />
              <input className="input" type="file" accept=".jar" onChange={(event) => setJarFile(event.target.files?.[0] ?? null)} required />
              <button className="button" type="submit" disabled={!selectedTenantId}>Jar uploaden</button>
            </form>
            {jars.length > 0 ? <div className="status" style={{ marginTop: 10 }}>{jars.map((jar) => `#${jar.id} ${jar.name} ${jar.version}`).join(" · ")}</div> : null}
          </div>

          <div className="card">
            <h3>Actieve jar instellen</h3>
            <form className="stack" onSubmit={setActiveJar}>
              <select className="input" value={activeJarId} onChange={(event) => setActiveJarId(event.target.value)} required>
                <option value="">Selecteer jar</option>
                {jars.map((jar) => (
                  <option key={jar.id} value={jar.id}>#{jar.id} - {jar.name} {jar.version}</option>
                ))}
              </select>
              <button className="button" type="submit" disabled={!selectedTenantId || !jars.length}>Actieve jar opslaan</button>
            </form>
          </div>

          <div className="card">
            <h3>Besparingsmodel</h3>
            <p className="status">Wordt gebruikt voor financiële inschatting per tenant.</p>
            <form className="stack" onSubmit={updateSavings}>
              <input className="input" placeholder="Minuten bespaard per run" value={timeSavedMinutes} onChange={(event) => setTimeSavedMinutes(event.target.value)} required />
              <input className="input" placeholder="Uurtarief in EUR" value={hourlyRate} onChange={(event) => setHourlyRate(event.target.value)} required />
              <button className="button" type="submit" disabled={!selectedTenantId}>Besparingsmodel opslaan</button>
            </form>
          </div>

          <div className="card">
            <h3>Recente jobs</h3>
            <div className="stack">
              {jobs.length ? jobs.map((job) => (<div key={job.id} className="status">#{job.id} {job.status} {job.filename ? `- ${job.filename}` : ""}</div>)) : <div className="status">Geen jobs gevonden voor deze omgeving.</div>}
            </div>
          </div>

          <div className="card">
            <h3>Gebruiksoverzicht actieve omgeving</h3>
            {summary ? (
              <div className="stack">
                <div className="status">Tool: {summary.toolName ?? "-"}</div>
                <div className="status">Runs: {summary.totalRuns}</div>
                <div className="status">Logins: {summary.loginCount ?? 0}</div>
                <div className="status">Data: {summary.dataUsedLabel ?? "0 B"}</div>
                <div className="status">Besparingsmodel: {summary.timeSavedMinutes ?? "-"} min/run · {summary.hourlyRate ?? "-"} EUR/u</div>
                <div className="status">Geschatte besparing: {summary.moneySaved !== null ? `EUR ${summary.moneySaved.toFixed(2)}` : "-"}</div>
              </div>
            ) : (
              <div className="status">Nog geen samenvatting beschikbaar.</div>
            )}

            {usage.length > 0 ? (
              <div style={{ marginTop: 14 }}>
                <div className="status" style={{ marginBottom: 8 }}>Laatste 14 dagen</div>
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
            ) : null}
          </div>
        </div>
      </main>
    </>
  );
}
