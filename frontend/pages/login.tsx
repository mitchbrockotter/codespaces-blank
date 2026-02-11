import * as React from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { apiRequest } from "../lib/api";

type LoginResponse = {
  user: {
    role: "ADMIN" | "USER";
  };
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const data = await apiRequest<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      if (data.user.role === "ADMIN") {
        router.push("/admin");
      } else {
        router.push("/app");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Customer Login - P&K Backend Automation</title>
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
            <a href="/login" className="nav-link nav-login active">Login</a>
          </div>
        </div>
      </nav>

      <div className="login-container">
        <div className="login-box">
          <h1>Customer Login</h1>
          <p className="login-subtitle">Access your backend environment</p>

          <form className="login-form" onSubmit={onSubmit}>
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                type="text"
                id="email"
                name="email"
                required
                placeholder="naam@bedrijf.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <small className="hint">Vul je email in</small>
            </div>

            <div className="form-group">
              <label htmlFor="password">Wachtwoord</label>
              <input
                type="password"
                id="password"
                name="password"
                required
                placeholder="Vul je wachtwoord in"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>

            {error && <div className="error-message" style={{ display: "block" }}>{error}</div>}

            <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
              {loading ? "Inloggen..." : "Inloggen"}
            </button>
          </form>

          <div className="login-footer">
            <p>Geen account? <a href="/">Neem contact op</a></p>
          </div>
        </div>

        {process.env.NODE_ENV !== "production" && (
          <div className="demo-credentials">
            <h3>Demo Credentials</h3>
            <p><strong>Customer Account:</strong></p>
            <code>Email: contact@acmecorp.com<br />Wachtwoord: password123</code>

            <p style={{ marginTop: 15 }}><strong>Admin Account:</strong></p>
            <code>Email: admin@techstart.io<br />Wachtwoord: securepass456</code>
          </div>
        )}
      </div>
    </>
  );
}
