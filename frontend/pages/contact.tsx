import * as React from "react";
import Head from "next/head";

const CONTACT_API_BASE = (
  process.env.NEXT_PUBLIC_CONTACT_API_BASE_URL
  || process.env.NEXT_PUBLIC_LEGACY_API_BASE_URL
  || process.env.NEXT_PUBLIC_API_BASE_URL
  || ""
).replace(/\/$/, "");

type ContactResponse = {
  success?: boolean;
  message?: string;
  error?: string;
};

function contactApiPath(path: string) {
  return `${CONTACT_API_BASE}${path}`;
}

export default function ContactPage() {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [emailText, setEmailText] = React.useState("");
  const [website, setWebsite] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!name.trim() || !email.trim() || !subject.trim() || !emailText.trim()) {
      setError("Vul alle verplichte velden in.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError("Vul een geldig e-mailadres in.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(contactApiPath("/api/contact"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          subject: subject.trim(),
          emailText: emailText.trim(),
          website: website.trim()
        })
      });

      const data = (await response.json().catch(() => ({}))) as ContactResponse;

      if (!response.ok) {
        setError(data.error || "Er ging iets mis bij het verzenden.");
        return;
      }

      setSuccess(data.message || "Bedankt voor uw bericht. Wij nemen zo snel mogelijk contact met u op.");
      setName("");
      setEmail("");
      setSubject("");
      setEmailText("");
      setWebsite("");
    } catch (err) {
      setError((err as Error).message || "Er ging iets mis bij het verzenden.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Contact - P&K Backend Automation</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

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
            <a href="/#features" className="nav-link">Features</a>
            <a href="/contact" className="nav-link nav-login active">Contact</a>
            <a href="/login" className="nav-link">Customer Login</a>
          </div>
        </div>
      </nav>

      <main className="contact-page-container">
        <section className="contact-form-panel">
          <h1>Contact Opnemen</h1>
          <p className="contact-page-subtitle">Stuur ons een bericht. Wij bevestigen uw aanvraag direct per e-mail.</p>

          <form className="contact-form" onSubmit={onSubmit} noValidate>
            <div className="honeypot-wrap" aria-hidden="true">
              <label htmlFor="website">Website</label>
              <input
                type="text"
                id="website"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="name">Naam</label>
              <input
                type="text"
                id="name"
                name="name"
                required
                maxLength={120}
                placeholder="Uw volledige naam"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="email">E-mailadres</label>
              <input
                type="email"
                id="email"
                name="email"
                required
                maxLength={150}
                placeholder="naam@bedrijf.nl"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="subject">Onderwerp</label>
              <input
                type="text"
                id="subject"
                name="subject"
                required
                maxLength={200}
                placeholder="Waar gaat uw vraag over?"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="emailText">Bericht</label>
              <textarea
                id="emailText"
                name="emailText"
                rows={7}
                required
                maxLength={5000}
                placeholder="Schrijf hier uw bericht"
                value={emailText}
                onChange={(event) => setEmailText(event.target.value)}
              />
            </div>

            {error && <div className="error-message" style={{ display: "block" }}>{error}</div>}
            {success && <div className="success-message" style={{ display: "block" }}>{success}</div>}

            <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
              {loading ? "Bezig met verzenden..." : "Verzenden"}
            </button>
          </form>
        </section>
      </main>

      <footer className="footer">
        <p>&copy; 2026 P&K Backend Automation. All rights reserved. KvK: 99874776</p>
      </footer>
    </>
  );
}
