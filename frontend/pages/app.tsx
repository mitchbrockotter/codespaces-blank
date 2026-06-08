import * as React from "react";
import { useRouter } from "next/router";
import { apiRequest, ApiUser } from "../lib/api";

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

function normalizeObjectValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value).trim();
}

function parseRowsFromObjects(rows: Record<string, unknown>[]): ContactImportRow[] {
  if (!rows.length) {
    return [];
  }

  const parsed: ContactImportRow[] = [];

  for (const rawRow of rows) {
    const normalizedRow: Record<string, string> = {};
    Object.entries(rawRow).forEach(([key, value]) => {
      normalizedRow[normalizeHeader(key)] = normalizeObjectValue(value);
    });

    const name = normalizedRow.name || normalizedRow.naam || normalizedRow.customer || normalizedRow.klant;
    if (!name) {
      continue;
    }

    const contactedAtRaw =
      normalizedRow.contactedat ||
      normalizedRow.laatstecontact ||
      normalizedRow.contactdatum ||
      normalizedRow.datum ||
      "";

    parsed.push({
      name,
      company: normalizedRow.company || normalizedRow.bedrijf || undefined,
      email: normalizedRow.email || normalizedRow.mail || undefined,
      phone: normalizedRow.phone || normalizedRow.telefoon || normalizedRow.gsm || normalizedRow.mobiel || undefined,
      contactedAt: contactedAtRaw ? parseContactDate(contactedAtRaw) : undefined,
      contactMethod: normalizedRow.contactmethod || normalizedRow.methode || normalizedRow.kanaal || normalizedRow.method || undefined,
      summary: normalizedRow.summary || normalizedRow.notitie || normalizedRow.notes || normalizedRow.omschrijving || undefined
    });
  }

  return parsed;
}

export default function AppPage() {
  const router = useRouter();
  const [user, setUser] = React.useState<ApiUser | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);
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
  const [importRowsFromFile, setImportRowsFromFile] = React.useState<ContactImportRow[]>([]);
  const [importInfo, setImportInfo] = React.useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newEmail, setNewEmail] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");

  const loadContactsOverview = React.useCallback(async (days = followUpDays) => {
    const data = await apiRequest<ContactsOverviewResponse>(`/contacts/customers?followUpDays=${days}`);
    setContactsOverview(data);
    if (!eventCustomerId && data.customers.length > 0) {
      setEventCustomerId(String(data.customers[0].id));
    }
  }, [eventCustomerId, followUpDays]);

  React.useEffect(() => {
    apiRequest<{ user: ApiUser }>("/auth/me")
      .then(({ user: authenticatedUser }) => {
        if (authenticatedUser.role === "ADMIN") {
          router.replace("/admin");
          return;
        }

        setUser(authenticatedUser);
        apiRequest<ContactsAccessResponse>("/contacts/access")
          .then((access) => {
            setContactsEnabled(access.enabled);
            if (!access.enabled) {
              setContactsOverview(null);
              return;
            }
            loadContactsOverview().catch(() => setContactsOverview(null));
          })
          .catch(() => {
            setContactsEnabled(false);
            setContactsOverview(null);
          });
      })
      .catch(() => router.replace("/login"));
  }, [router, loadContactsOverview]);

  const logout = async () => {
    setError(null);
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

    setError(null);
    setImportInfo(null);

    try {
      const lowerName = file.name.toLowerCase();

      if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
        const xlsx = await import("xlsx");
        const workbook = xlsx.read(await file.arrayBuffer(), {
          type: "array",
          cellDates: true
        });

        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
          setError("Import mislukt: Excel-bestand bevat geen sheet");
          setImportRowsFromFile([]);
          return;
        }

        const rawRows = xlsx.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
          defval: ""
        }) as Record<string, unknown>[];
        const parsedRows = parseRowsFromObjects(rawRows);

        if (!parsedRows.length) {
          setError("Import mislukt: geen geldige rijen of kolom Name/Naam gevonden");
          setImportRowsFromFile([]);
          return;
        }

        setImportRowsFromFile(parsedRows);
        setImportText("");
        setImportInfo(`Excel-bestand ${file.name} geladen met ${parsedRows.length} geldige regels.`);
        return;
      }

      const text = await file.text();
      const parsedRows = parseImportRows(text);
      setImportText(text);
      setImportRowsFromFile(parsedRows);
      if (parsedRows.length) {
        setImportInfo(`Bestand ${file.name} geladen met ${parsedRows.length} geldige regels.`);
      } else {
        setImportInfo(`Bestand ${file.name} geladen. Controleer de data en klik op importeren.`);
      }
    } catch (err) {
      setError((err as Error).message);
      setImportRowsFromFile([]);
    }
  };

  const importRows = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setImportInfo(null);

    const typedRows = importText.trim() ? parseImportRows(importText) : [];
    const rows = typedRows.length ? typedRows : importRowsFromFile;

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
      setImportText("");
      setImportRowsFromFile([]);
      await loadContactsOverview();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const environmentLabel = "Merlijn Meubels omgeving";
  const allCustomers = contactsOverview?.customers ?? [];
  const followUpCustomers = allCustomers.filter((customer) => customer.needsFollowUp);
  const showOverview = activeSection === "overzicht";
  const showCustomers = activeSection === "klanten";
  const showFollowUp = activeSection === "opvolging";
  const showImport = activeSection === "import";
  const showAccount = activeSection === "account";

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
            {user ? <span className="user-display">Ingelogd als {user.email}</span> : null}
            <button className="nav-link nav-login nav-link-button" type="button" onClick={logout} disabled={isLoggingOut}>
              {isLoggingOut ? "Uitloggen..." : "Uitloggen"}
            </button>
          </div>
        </div>
      </nav>

      <main className="workspace-shell">
        <section className="workspace-hero">
          <div className="workspace-hero-copy">
            <div className="badge">Afgeschermde klantomgeving</div>
            <h1>{environmentLabel}</h1>
            <p className="workspace-lead">
              Een vertrouwde werkomgeving om klantinformatie, opvolging en import centraal te beheren.
            </p>
            <div className="workspace-meta">
              <span>{user ? `Ingelogd als ${user.email}` : "Account laden..."}</span>
              <span>Beveiligde omgeving</span>
              <span>Alleen voor Merlijn Meubels</span>
            </div>
          </div>

          <div className="workspace-hero-panel">
            <div className="workspace-panel-label">Live overzicht</div>
            <div className="workspace-panel-value">Omgeving gereed</div>
            <div className="workspace-panel-subtitle">Klantbeheer en import zijn beschikbaar</div>
            <div className="workspace-panel-stats">
              <div>
                <strong>{contactsOverview?.totalCustomers ?? 0}</strong>
                <span>Klanten</span>
              </div>
              <div>
                <strong>{contactsOverview?.followUpNeeded ?? 0}</strong>
                <span>Opvolging nodig</span>
              </div>
              <div>
                <strong>{contactsOverview?.followUpDays ?? followUpDays}</strong>
                <span>Dagen termijn</span>
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
              <h2>Start met klantbeheer</h2>
              <p>
                Voeg direct een klant toe, registreer contactmomenten en houd opvolging centraal bij in deze omgeving.
              </p>
              <div className="stack">
                <button className="button button-strong" type="button" onClick={() => setActiveSection("klanten")}>Ga naar klanten</button>
                <button className="button button-secondary" type="button" onClick={() => setActiveSection("import")}>Open import</button>
              </div>
              <div className="workspace-inline-status">
                <span>Status</span>
                <strong>Klaar voor gebruik</strong>
              </div>
            </article>
          ) : null}

          {showOverview ? (
            <article className="workspace-card workspace-card-side">
              <div className="card eyebrow">Resultaat</div>
              <h3>Stand van zaken</h3>
              <div className="workspace-metrics">
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
                  <strong>{contactsOverview?.followUpDays ?? followUpDays} dgn</strong>
                </div>
              </div>
              <p className="status">Rapportgeneratie is verwijderd voor deze omgeving.</p>
            </article>
          ) : null}

          {showCustomers ? (
            contactsEnabled ? (
              <article className="workspace-card workspace-card-wide">
                <div className="card eyebrow">Klantbeheer</div>
                <h3>Klanten en contactmomenten</h3>
                <p className="status">
                  Voeg klanten toe, registreer contactmomenten en beheer alle gegevens in één overzicht.
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
                      {allCustomers.length ? (
                        allCustomers.map((customer) => (
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
                    <button className="button" type="submit" disabled={!allCustomers.length}>Contact opslaan</button>
                  </form>
                </div>

                <div className="workspace-table-wrap">
                  <table className="workspace-table">
                    <thead>
                      <tr>
                        <th>Klant</th>
                        <th>Contact</th>
                        <th>Laatste contact</th>
                        <th>Status</th>
                        <th>Actie</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allCustomers.length ? (
                        allCustomers.map((customer) => (
                          <tr key={customer.id}>
                            <td>
                              <strong>{customer.name}</strong>
                              {customer.company ? <div className="status">{customer.company}</div> : null}
                            </td>
                            <td>
                              {customer.email ? <div className="status">{customer.email}</div> : null}
                              {customer.phone ? <div className="status">{customer.phone}</div> : null}
                              {!customer.email && !customer.phone ? "-" : null}
                            </td>
                            <td>
                              {customer.lastContactAt
                                ? new Date(customer.lastContactAt).toLocaleString()
                                : "Nog geen contact geregistreerd"}
                            </td>
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
              <h3>Bestaande data importeren</h3>
              <p className="status">
                Ondersteund: CSV, TXT, XLS en XLSX. Verplichte kolom: Name of Naam.
              </p>
              <form className="stack workspace-import" onSubmit={importRows}>
                <input className="input" type="file" accept=".csv,.txt,.xls,.xlsx" onChange={onImportFilePicked} />
                <textarea
                  className="input"
                  rows={8}
                  value={importText}
                  onChange={(entry) => {
                    setImportText(entry.target.value);
                    if (entry.target.value.trim()) {
                      setImportRowsFromFile([]);
                    }
                  }}
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
                    {followUpCustomers.length ? (
                      followUpCustomers.map((customer) => (
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
                            <span className="tag tag-alert">Opvolging nodig</span>
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
                        <td colSpan={5}>Geen klanten met open opvolging.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          ) : null}

          {showAccount ? (
            <aside className="workspace-card workspace-card-wide">
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
    </>
  );
}