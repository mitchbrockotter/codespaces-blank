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
  loginCount?: number;
  dataUsedBytes?: number;
  dataUsedLabel?: string;
};

type UsagePoint = {
  day: string;
  runs: number;
};

type ContactCustomer = {
  id: number;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  createdAt: string;
  lastContactAt: string | null;
  lastContactMethod: string | null;
  lastContactSummary: string | null;
  daysSinceLastContact: number | null;
  needsFollowUp: boolean;
};

type ContactsOverviewResponse = {
  followUpDays: number;
  totalCustomers: number;
  followUpNeeded: number;
  customers: ContactCustomer[];
};

type ContactsAccessResponse = {
  enabled: boolean;
};

type ContactImportRow = {
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  contactedAt?: string;
  contactMethod?: string;
  summary?: string;
};

function parseDelimitedLine(line: string, delimiter: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function normalizeHeader(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function parseContactDate(raw: string) {
  const cleaned = raw.trim();
  if (!cleaned) {
    return undefined;
  }

  const asDate = new Date(cleaned);
  if (!Number.isNaN(asDate.getTime())) {
    return asDate.toISOString();
  }

  const nlMatch = cleaned.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (nlMatch) {
    const day = Number(nlMatch[1]);
    const month = Number(nlMatch[2]) - 1;
    const year = Number(nlMatch[3].length === 2 ? `20${nlMatch[3]}` : nlMatch[3]);
    const hour = Number(nlMatch[4] ?? 0);
    const minute = Number(nlMatch[5] ?? 0);
    const value = new Date(year, month, day, hour, minute);
    if (!Number.isNaN(value.getTime())) {
      return value.toISOString();
    }
  }

  return undefined;
}

function parseImportRows(text: string): ContactImportRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const sample = lines[0];
  const delimiterCandidates = [",", ";", "\t"];
  const countDelimiter = (value: string, token: string) => value.split(token).length - 1;
  const delimiter = delimiterCandidates.reduce((best, candidate) => {
    const score = countDelimiter(sample, candidate);
    if (score > best.score) {
      return { token: candidate, score };
    }
    return best;
  }, { token: ",", score: -1 }).token;

  const headers = parseDelimitedLine(lines[0], delimiter).map(normalizeHeader);

  const headerIndex = {
    name: headers.findIndex((header) => ["name", "naam", "customer", "klant"].includes(header)),
    company: headers.findIndex((header) => ["company", "bedrijf"].includes(header)),
    email: headers.findIndex((header) => ["email", "mail"].includes(header)),
    phone: headers.findIndex((header) => ["phone", "telefoon", "gsm", "mobiel"].includes(header)),
    contactedAt: headers.findIndex((header) => ["contactedat", "laatstecontact", "contactdatum", "datum"].includes(header)),
    contactMethod: headers.findIndex((header) => ["contactmethod", "methode", "kanaal", "method"].includes(header)),
    summary: headers.findIndex((header) => ["summary", "notitie", "notes", "omschrijving"].includes(header))
  };

  if (headerIndex.name < 0) {
    return [];
  }

  const rows: ContactImportRow[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseDelimitedLine(lines[i], delimiter);
    const name = cells[headerIndex.name]?.trim();
    if (!name) {
      continue;
    }

    const contactedAtRaw = headerIndex.contactedAt >= 0 ? cells[headerIndex.contactedAt] : "";

    rows.push({
      name,
      company: headerIndex.company >= 0 ? cells[headerIndex.company]?.trim() || undefined : undefined,
      email: headerIndex.email >= 0 ? cells[headerIndex.email]?.trim() || undefined : undefined,
      phone: headerIndex.phone >= 0 ? cells[headerIndex.phone]?.trim() || undefined : undefined,
      contactedAt: contactedAtRaw ? parseContactDate(contactedAtRaw) : undefined,
      contactMethod: headerIndex.contactMethod >= 0 ? cells[headerIndex.contactMethod]?.trim() || undefined : undefined,
      summary: headerIndex.summary >= 0 ? cells[headerIndex.summary]?.trim() || undefined : undefined
    });
  }

  return rows;
}

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
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newEmail, setNewEmail] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [contactsOverview, setContactsOverview] = React.useState<ContactsOverviewResponse | null>(null);
  const [followUpDays, setFollowUpDays] = React.useState(14);
  const [newCustomerName, setNewCustomerName] = React.useState("");
  const [newCustomerCompany, setNewCustomerCompany] = React.useState("");
  const [newCustomerEmail, setNewCustomerEmail] = React.useState("");
  const [newCustomerPhone, setNewCustomerPhone] = React.useState("");
  const [isCreateCustomerModalOpen, setIsCreateCustomerModalOpen] = React.useState(false);
  const [newCustomerInitialMethod, setNewCustomerInitialMethod] = React.useState("Telefoon");
  const [newCustomerInitialDateTime, setNewCustomerInitialDateTime] = React.useState("");
  const [newCustomerInitialSummary, setNewCustomerInitialSummary] = React.useState("");
  const [isEditCustomerModalOpen, setIsEditCustomerModalOpen] = React.useState(false);
  const [isDeleteCustomerModalOpen, setIsDeleteCustomerModalOpen] = React.useState(false);
  const [deletingCustomer, setDeletingCustomer] = React.useState<ContactCustomer | null>(null);
  const [editingCustomerId, setEditingCustomerId] = React.useState<number | null>(null);
  const [editCustomerName, setEditCustomerName] = React.useState("");
  const [editCustomerCompany, setEditCustomerCompany] = React.useState("");
  const [editCustomerEmail, setEditCustomerEmail] = React.useState("");
  const [editCustomerPhone, setEditCustomerPhone] = React.useState("");
  const [contactsEnabled, setContactsEnabled] = React.useState(false);
  const [activeSection, setActiveSection] = React.useState<"overzicht" | "klanten" | "opvolging" | "import" | "account">("overzicht");
  const [eventCustomerId, setEventCustomerId] = React.useState("");
  const [eventMethod, setEventMethod] = React.useState("Telefoon");
  const [eventSummary, setEventSummary] = React.useState("");
  const [eventDateTime, setEventDateTime] = React.useState("");
  const [importText, setImportText] = React.useState("");
  const [importInfo, setImportInfo] = React.useState<string | null>(null);
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const loadContactsOverview = React.useCallback(async (days = followUpDays) => {
    const data = await apiRequest<ContactsOverviewResponse>(`/contacts/customers?followUpDays=${days}`);
    setContactsOverview(data);
    if (!eventCustomerId && data.customers.length > 0) {
      setEventCustomerId(String(data.customers[0].id));
    }
  }, [eventCustomerId, followUpDays]);

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
          apiRequest<ContactsAccessResponse>("/contacts/access")
            .then((access) => {
              setContactsEnabled(access.enabled);
              if (access.enabled) {
                return loadContactsOverview();
              }
              setContactsOverview(null);
              return Promise.resolve();
            })
            .catch(() => {
              setContactsEnabled(false);
              setContactsOverview(null);
            });
        }
      })
      .catch(() => router.replace("/login"));
  }, [router, loadContactsOverview]);

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

  const updateAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    try {
      const data = await apiRequest<{ ok: true; user: ApiUser }>("/auth/account", {
        method: "POST",
        body: JSON.stringify({
          currentPassword,
          newEmail: newEmail || undefined,
          newPassword: newPassword || undefined
        })
      });

      setUser(data.user);
      setCurrentPassword("");
      setNewEmail("");
      setNewPassword("");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const createCustomer = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    try {
      const created = await apiRequest<{ customer: { id: number } }>("/contacts/customers", {
        method: "POST",
        body: JSON.stringify({
          name: newCustomerName,
          company: newCustomerCompany || undefined,
          email: newCustomerEmail || undefined,
          phone: newCustomerPhone || undefined
        })
      });

      if (newCustomerInitialDateTime || newCustomerInitialSummary.trim()) {
        await apiRequest<{ ok: true }>("/contacts/events", {
          method: "POST",
          body: JSON.stringify({
            customerId: created.customer.id,
            contactMethod: newCustomerInitialMethod,
            summary: newCustomerInitialSummary || undefined,
            contactedAt: newCustomerInitialDateTime ? new Date(newCustomerInitialDateTime).toISOString() : undefined
          })
        });
      }

      setNewCustomerName("");
      setNewCustomerCompany("");
      setNewCustomerEmail("");
      setNewCustomerPhone("");
      setNewCustomerInitialMethod("Telefoon");
      setNewCustomerInitialDateTime("");
      setNewCustomerInitialSummary("");
      setEventCustomerId(String(created.customer.id));
      setIsCreateCustomerModalOpen(false);
      await loadContactsOverview();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const registerContactEvent = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!eventCustomerId) {
      setError("Selecteer eerst een klant");
      return;
    }

    try {
      await apiRequest<{ ok: true }>("/contacts/events", {
        method: "POST",
        body: JSON.stringify({
          customerId: Number(eventCustomerId),
          contactMethod: eventMethod,
          summary: eventSummary || undefined,
          contactedAt: eventDateTime ? new Date(eventDateTime).toISOString() : undefined
        })
      });

      setEventSummary("");
      setEventDateTime("");
      await loadContactsOverview();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const openEditCustomerModal = (customer: ContactCustomer) => {
    setEditingCustomerId(customer.id);
    setEditCustomerName(customer.name);
    setEditCustomerCompany(customer.company ?? "");
    setEditCustomerEmail(customer.email ?? "");
    setEditCustomerPhone(customer.phone ?? "");
    setIsEditCustomerModalOpen(true);
  };

  const updateCustomer = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!editingCustomerId) {
      setError("No customer selected");
      return;
    }

    try {
      await apiRequest<{ customer: { id: number } }>(`/contacts/customers/${editingCustomerId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editCustomerName,
          company: editCustomerCompany || undefined,
          email: editCustomerEmail || undefined,
          phone: editCustomerPhone || undefined
        })
      });

      setIsEditCustomerModalOpen(false);
      setEditingCustomerId(null);
      await loadContactsOverview();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const openDeleteCustomerModal = (customer: ContactCustomer) => {
    setDeletingCustomer(customer);
    setIsDeleteCustomerModalOpen(true);
  };

  const deleteCustomer = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!deletingCustomer) {
      setError("No customer selected");
      return;
    }

    try {
      await apiRequest<{ ok: true }>(`/contacts/customers/${deletingCustomer.id}`, {
        method: "DELETE"
      });

      if (eventCustomerId === String(deletingCustomer.id)) {
        setEventCustomerId("");
      }

      setIsDeleteCustomerModalOpen(false);
      setDeletingCustomer(null);
      await loadContactsOverview();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const updateFollowUpWindow = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await loadContactsOverview(followUpDays);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const onImportFilePicked = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      setImportText(text);
      setImportInfo(`Bestand ${file.name} geladen. Controleer de data en klik op importeren.`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const importRows = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setImportInfo(null);

    const rows = parseImportRows(importText);
    if (!rows.length) {
      setError("Import mislukt: geen geldige rijen of kolom Name/Naam gevonden");
      return;
    }

    try {
      const result = await apiRequest<{
        ok: true;
        importedRows: number;
        createdCustomers: number;
        updatedCustomers: number;
        createdEvents: number;
      }>("/contacts/import", {
        method: "POST",
        body: JSON.stringify({ rows })
      });

      setImportInfo(
        `${result.importedRows} regels verwerkt: ${result.createdCustomers} nieuwe klanten, ${result.updatedCustomers} bijgewerkt, ${result.createdEvents} contactmomenten toegevoegd.`
      );
      await loadContactsOverview();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const moneySaved = summary?.moneySaved !== null && summary?.moneySaved !== undefined
    ? summary.moneySaved.toFixed(2)
    : null;

  const maxRuns = usage.reduce((max: number, point: UsagePoint) => Math.max(max, point.runs), 0);
  const environmentLabel = "Merlijn Meubels omgeving";

  const lastSevenDays = usage.slice(-7);
  const showOverview = activeSection === "overzicht";
  const showCustomers = activeSection === "klanten";
  const showFollowUp = activeSection === "opvolging";
  const showImport = activeSection === "import";
  const showAccount = activeSection === "account";

  return (
    <main className="workspace-shell">
      <section className="workspace-hero">
        <div className="workspace-hero-copy">
          <div className="badge">Afgeschermde klantomgeving</div>
          <h1>{environmentLabel}</h1>
          <p className="workspace-lead">
            Een vertrouwde werkomgeving om het handmatige Excel-proces te vervangen door een veilige en overzichtelijke workflow.
          </p>
          <div className="workspace-meta">
            <span>{user ? `Ingelogd als ${user.email}` : "Account laden..."}</span>
            <span>Beveiligde omgeving</span>
            <span>Alleen voor Merlijn Meubels</span>
          </div>
        </div>

        <div className="workspace-hero-panel">
          <div className="workspace-panel-label">Live overzicht</div>
          <div className="workspace-panel-value">{summary?.toolName ?? "Omgeving gereed"}</div>
          <div className="workspace-panel-subtitle">{jobStatus ? `Huidige status: ${jobStatus.status}` : "Geen run actief"}</div>
          <div className="workspace-panel-stats">
            <div>
              <strong>{summary?.totalRuns ?? 0}</strong>
              <span>Afgeronde runs</span>
            </div>
            <div>
              <strong>{contactsOverview?.totalCustomers ?? 0}</strong>
              <span>Klanten</span>
            </div>
            <div>
              <strong>{contactsOverview?.followUpNeeded ?? 0}</strong>
              <span>Opvolging nodig</span>
            </div>
          </div>
        </div>
      </section>

      <section className="workspace-nav">
        <button className={`workspace-nav-button ${showOverview ? "active" : ""}`} type="button" onClick={() => setActiveSection("overzicht")}>Overzicht</button>
        {contactsEnabled ? <button className={`workspace-nav-button ${showCustomers ? "active" : ""}`} type="button" onClick={() => setActiveSection("klanten")}>Klanten</button> : null}
        {contactsEnabled ? <button className={`workspace-nav-button ${showFollowUp ? "active" : ""}`} type="button" onClick={() => setActiveSection("opvolging")}>Opvolging</button> : null}
        {contactsEnabled ? <button className={`workspace-nav-button ${showImport ? "active" : ""}`} type="button" onClick={() => setActiveSection("import")}>Import</button> : null}
        <button className={`workspace-nav-button ${showAccount ? "active" : ""}`} type="button" onClick={() => setActiveSection("account")}>Profiel</button>
      </section>

      <section className="workspace-grid">
        {showOverview ? (
        <article className="workspace-card workspace-card-primary">
          <div className="card eyebrow">Hoofdactie</div>
          <h2>Start het proces</h2>
          <p>
            Start de geautomatiseerde flow op het moment dat je normaal in Excel zou werken.
          </p>
          <div className="stack">
            <button className="button button-strong" onClick={runReport} disabled={!user}>
              Rapport genereren
            </button>
            <button
              className="button button-secondary"
              onClick={downloadReport}
              disabled={!report || downloaded || jobStatus?.status !== "done"}
            >
              {downloaded ? "Gedownload" : "Downloaden (eenmalig)"}
            </button>
          </div>
          <div className="workspace-inline-status">
            <span>Status</span>
            <strong>{jobStatus ? jobStatus.status : "inactief"}</strong>
          </div>
          {report && (
            <div className="status">Bestand: {report.filename} ({Math.round(report.size_bytes / 1024)} KB)</div>
          )}
          {downloaded && <div className="status">Gedownload. Genereer opnieuw om nogmaals te downloaden.</div>}
          {jobStatus?.status === "failed" && jobStatus.error_message && (
            <div className="notice">{jobStatus.error_message}</div>
          )}
        </article>
        ) : null}

        {showAccount ? (
        <aside className="workspace-card workspace-card-side">
          <div className="card eyebrow">Account</div>
          <h3>Inloggegevens wijzigen</h3>
          <p>Pas je e-mail of wachtwoord aan wanneer dat nodig is.</p>
          <form className="stack" onSubmit={updateAccount}>
            <input
              className="input"
              type="password"
              placeholder="Huidig wachtwoord"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
            <input
              className="input"
              type="email"
              placeholder="Nieuw e-mailadres"
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
            />
            <input
              className="input"
              type="password"
              placeholder="Nieuw wachtwoord"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              minLength={8}
            />
            <button className="button" type="submit">
              Inloggegevens opslaan
            </button>
          </form>
        </aside>
        ) : null}

        {showOverview ? (
        <article className="workspace-card">
          <div className="card eyebrow">Resultaat</div>
          <h3>Gebruik en besparing</h3>
          <div className="workspace-metrics">
            <div>
              <span>Runs</span>
              <strong>{summary?.totalRuns ?? 0}</strong>
            </div>
            <div>
              <span>Besparing</span>
              <strong>{moneySaved ? `EUR ${moneySaved}` : "-"}</strong>
            </div>
            <div>
              <span>Klanten</span>
              <strong>{contactsOverview?.totalCustomers ?? 0}</strong>
            </div>
          </div>
          {summary && (
            <div className="status">Actieve tool: {summary.toolName ?? "Rapport generator"}</div>
          )}
        </article>
        ) : null}

        {showOverview ? (
        <article className="workspace-card">
          <div className="card eyebrow">Trend</div>
          <h3>Laatste 7 dagen</h3>
          <p className="status">Recente activiteit in deze omgeving.</p>
          {lastSevenDays.length > 0 ? (
            <div className="trend-chart">
              {lastSevenDays.map((point) => (
                <div key={point.day} className="trend-column">
                  <div
                    className="trend-bar"
                    style={{ height: maxRuns > 0 ? `${Math.max(14, Math.round((point.runs / maxRuns) * 100))}%` : "14%" }}
                    title={`${point.day}: ${point.runs} runs`}
                  />
                  <span>{point.day.slice(5)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="status">Nog geen gebruik geregistreerd.</div>
          )}
        </article>
        ) : null}

        {showCustomers ? (
          contactsEnabled ? (
            <article className="workspace-card workspace-card-wide">
              <div className="card eyebrow">Klantbeheer</div>
              <h3>Contactmomenten registreren</h3>
              <p className="status">
                Voeg klanten toe en registreer contactmomenten handmatig. Opvolging wordt daarna automatisch berekend.
              </p>

              <div className="workspace-split">
                <div className="stack">
                  <h4>Nieuwe klant</h4>
                  <p className="status">Open het venster om een klant met alle gegevens toe te voegen.</p>
                  <button className="button" type="button" onClick={() => setIsCreateCustomerModalOpen(true)}>
                    Klant toevoegen
                  </button>
                </div>

                <form className="stack" onSubmit={registerContactEvent}>
                  <h4>Contact registreren</h4>
                  <select
                    className="input"
                    value={eventCustomerId}
                    onChange={(entry) => setEventCustomerId(entry.target.value)}
                    required
                  >
                    {contactsOverview?.customers.length ? (
                      contactsOverview.customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>{customer.name}</option>
                      ))
                    ) : (
                      <option value="">Nog geen klanten</option>
                    )}
                  </select>
                  <select
                    className="input"
                    value={eventMethod}
                    onChange={(entry) => setEventMethod(entry.target.value)}
                  >
                    <option>Telefoon</option>
                    <option>Email</option>
                    <option>WhatsApp</option>
                    <option>Op locatie</option>
                    <option>Overig</option>
                  </select>
                  <input
                    className="input"
                    type="datetime-local"
                    value={eventDateTime}
                    onChange={(entry) => setEventDateTime(entry.target.value)}
                  />
                  <textarea
                    className="input"
                    placeholder="Korte notitie over het contact"
                    value={eventSummary}
                    onChange={(entry) => setEventSummary(entry.target.value)}
                    rows={3}
                  />
                  <button className="button" type="submit" disabled={!contactsOverview?.customers.length}>Contact opslaan</button>
                </form>
              </div>
            </article>
          ) : (
            <article className="workspace-card workspace-card-wide">
              <div className="card eyebrow">Klantbeheer</div>
              <h3>Contactmodule niet actief</h3>
              <p className="status">Deze module is alleen beschikbaar in de omgeving van Merlijn Meubels.</p>
            </article>
          )
        ) : null}

        {contactsEnabled && showImport ? (
        <article className="workspace-card workspace-card-wide">
          <div className="card eyebrow">Excel import</div>
          <h3>Bestaande Excel data importeren</h3>
          <p className="status">
            Verplichte kolom: Name of Naam. Optioneel: Company/Bedrijf, Email, Phone/Telefoon, ContactedAt/Datum, ContactMethod/Methode, Summary/Notitie.
          </p>
          <form className="stack workspace-import" onSubmit={importRows}>
            <input className="input" type="file" accept=".csv,.txt" onChange={onImportFilePicked} />
            <textarea
              className="input"
              rows={8}
              value={importText}
              onChange={(entry) => setImportText(entry.target.value)}
              placeholder={"Name,Company,Email,ContactedAt,ContactMethod,Summary\nJan Jansen,Merlijn Meubels,jan@example.nl,2026-06-01 10:30,Telefoon,Interesse in offerte"}
            />
            <button className="button" type="submit">Regels importeren</button>
            {importInfo ? <div className="status">{importInfo}</div> : null}
          </form>
        </article>
        ) : null}

        {contactsEnabled && showFollowUp ? (
        <article className="workspace-card workspace-card-wide">
          <div className="card eyebrow">Opvolging</div>
          <h3>Welke klanten hebben opvolging nodig?</h3>
          <form className="workspace-follow-up-filter" onSubmit={updateFollowUpWindow}>
            <label className="status" htmlFor="follow-up-days">Opvolging na aantal dagen zonder contact</label>
            <input
              id="follow-up-days"
              className="input"
              type="number"
              min={1}
              max={120}
              value={followUpDays}
              onChange={(entry) => setFollowUpDays(Number(entry.target.value) || 14)}
            />
            <button className="button" type="submit">Verversen</button>
          </form>

          <div className="workspace-metrics" style={{ marginTop: 10 }}>
            <div>
              <span>Totaal klanten</span>
              <strong>{contactsOverview?.totalCustomers ?? 0}</strong>
            </div>
            <div>
              <span>Opvolging nodig</span>
              <strong>{contactsOverview?.followUpNeeded ?? 0}</strong>
            </div>
            <div>
              <span>Termijn</span>
              <strong>{contactsOverview?.followUpDays ?? followUpDays} dagen</strong>
            </div>
          </div>

          <div className="workspace-table-wrap">
            <table className="workspace-table">
              <thead>
                <tr>
                  <th>Klant</th>
                  <th>Laatste contact</th>
                  <th>Dagen geleden</th>
                  <th>Status</th>
                  <th>Actie</th>
                </tr>
              </thead>
              <tbody>
                {contactsOverview?.customers.length ? (
                  contactsOverview.customers.map((customer) => (
                    <tr key={customer.id}>
                      <td>
                        <strong>{customer.name}</strong>
                        {customer.company ? <div className="status">{customer.company}</div> : null}
                      </td>
                      <td>
                        {customer.lastContactAt
                          ? new Date(customer.lastContactAt).toLocaleString()
                          : "Nog geen contact geregistreerd"}
                      </td>
                      <td>{customer.daysSinceLastContact ?? "-"}</td>
                      <td>
                        <span className={customer.needsFollowUp ? "tag tag-alert" : "tag"}>
                          {customer.needsFollowUp ? "Opvolging nodig" : "Bijgewerkt"}
                        </span>
                      </td>
                      <td>
                        <div className="workspace-actions">
                          <button className="button button-secondary button-small" type="button" onClick={() => openEditCustomerModal(customer)}>
                            Bewerken
                          </button>
                          <button className="button button-danger button-small" type="button" onClick={() => openDeleteCustomerModal(customer)}>
                            Verwijderen
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5}>Nog geen klanten toegevoegd.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
        ) : null}
      </section>

      {isCreateCustomerModalOpen ? (
        <div className="workspace-modal" role="dialog" aria-modal="true" aria-label="Nieuwe klant toevoegen">
          <div className="workspace-modal-content">
            <div className="workspace-modal-header">
              <h3>Nieuwe klant toevoegen</h3>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setIsCreateCustomerModalOpen(false)}
              >
                Sluiten
              </button>
            </div>

            <form className="stack" onSubmit={createCustomer}>
              <input
                className="input"
                type="text"
                placeholder="Naam klant"
                value={newCustomerName}
                onChange={(entry) => setNewCustomerName(entry.target.value)}
                required
              />
              <input
                className="input"
                type="text"
                placeholder="Bedrijf"
                value={newCustomerCompany}
                onChange={(entry) => setNewCustomerCompany(entry.target.value)}
              />
              <input
                className="input"
                type="email"
                placeholder="E-mail"
                value={newCustomerEmail}
                onChange={(entry) => setNewCustomerEmail(entry.target.value)}
              />
              <input
                className="input"
                type="text"
                placeholder="Telefoon"
                value={newCustomerPhone}
                onChange={(entry) => setNewCustomerPhone(entry.target.value)}
              />

              <h4>Eerste contact (optioneel)</h4>
              <select
                className="input"
                value={newCustomerInitialMethod}
                onChange={(entry) => setNewCustomerInitialMethod(entry.target.value)}
              >
                <option>Telefoon</option>
                <option>Email</option>
                <option>WhatsApp</option>
                <option>Op locatie</option>
                <option>Overig</option>
              </select>
              <input
                className="input"
                type="datetime-local"
                value={newCustomerInitialDateTime}
                onChange={(entry) => setNewCustomerInitialDateTime(entry.target.value)}
              />
              <textarea
                className="input"
                rows={3}
                placeholder="Notitie eerste contact"
                value={newCustomerInitialSummary}
                onChange={(entry) => setNewCustomerInitialSummary(entry.target.value)}
              />

              <button className="button" type="submit">Klant opslaan</button>
            </form>
          </div>
        </div>
      ) : null}

      {isEditCustomerModalOpen ? (
        <div className="workspace-modal" role="dialog" aria-modal="true" aria-label="Klant bewerken">
          <div className="workspace-modal-content">
            <div className="workspace-modal-header">
              <h3>Klant bewerken</h3>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setIsEditCustomerModalOpen(false)}
              >
                Sluiten
              </button>
            </div>

            <form className="stack" onSubmit={updateCustomer}>
              <input
                className="input"
                type="text"
                placeholder="Naam klant"
                value={editCustomerName}
                onChange={(entry) => setEditCustomerName(entry.target.value)}
                required
              />
              <input
                className="input"
                type="text"
                placeholder="Bedrijf"
                value={editCustomerCompany}
                onChange={(entry) => setEditCustomerCompany(entry.target.value)}
              />
              <input
                className="input"
                type="email"
                placeholder="E-mail"
                value={editCustomerEmail}
                onChange={(entry) => setEditCustomerEmail(entry.target.value)}
              />
              <input
                className="input"
                type="text"
                placeholder="Telefoon"
                value={editCustomerPhone}
                onChange={(entry) => setEditCustomerPhone(entry.target.value)}
              />
              <button className="button" type="submit">Wijzigingen opslaan</button>
            </form>
          </div>
        </div>
      ) : null}

      {isDeleteCustomerModalOpen ? (
        <div className="workspace-modal" role="dialog" aria-modal="true" aria-label="Klant verwijderen">
          <div className="workspace-modal-content">
            <div className="workspace-modal-header">
              <h3>Klant verwijderen</h3>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => {
                  setIsDeleteCustomerModalOpen(false);
                  setDeletingCustomer(null);
                }}
              >
                Annuleren
              </button>
            </div>

            <form className="stack" onSubmit={deleteCustomer}>
              <p>
                Weet je zeker dat je <strong>{deletingCustomer?.name ?? "deze klant"}</strong> wilt verwijderen?
                Alle gekoppelde contactmomenten worden ook verwijderd.
              </p>
              <button className="button button-danger" type="submit">Definitief verwijderen</button>
            </form>
          </div>
        </div>
      ) : null}

      {error && <div className="workspace-error">{error}</div>}
    </main>
  );
}
