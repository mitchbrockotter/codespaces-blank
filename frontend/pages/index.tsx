import Head from "next/head";

export default function Home() {
  return (
    <>
      <Head>
        <title>P&K Backend Automation</title>
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
            <a href="#features" className="nav-link">Features</a>
            <a href="#contact" className="nav-link">Contact</a>
            <a href="/login" className="nav-link nav-login">Customer Login</a>
          </div>
        </div>
      </nav>

      <header className="hero">
        <div className="hero-content">
          <img src="/images/logo.png" alt="P&K Backend Automation Logo" className="hero-logo" />
          <p>Streamline Your Backend Infrastructure Management</p>
          <p className="subtitle">Automated solutions for modern development environments</p>
          <a href="/login" className="btn btn-primary btn-large">Login to Your Environment</a>
        </div>
      </header>

      <section id="features" className="features">
        <div className="features-container">
          <h2>Our Services</h2>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">⚙️</div>
              <h3>Automated Deployment</h3>
              <p>Deploy your applications with zero downtime using our automated deployment pipelines.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">📊</div>
              <h3>Real-Time Monitoring</h3>
              <p>Monitor your backend infrastructure in real-time with comprehensive dashboards and alerts.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🔒</div>
              <h3>Security &amp; Compliance</h3>
              <p>Enterprise-grade security with compliance tracking and automated vulnerability scanning.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🚀</div>
              <h3>Performance Optimization</h3>
              <p>Optimize your backend performance with intelligent resource allocation and scaling.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">📈</div>
              <h3>Analytics &amp; Reporting</h3>
              <p>Detailed analytics and customizable reports to track your infrastructure health.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">💬</div>
              <h3>24/7 Support</h3>
              <p>Dedicated support team available around the clock to assist you.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="contact" className="contact">
        <div className="contact-container">
          <h2>Get in Touch</h2>
          <div className="contact-info">
            <div className="contact-item">
              <strong>Email:</strong> support@pkautomation.com
            </div>
            <div className="contact-item">
              <strong>Phone:</strong> +1 (555) 123-4567
            </div>
            <div className="contact-item">
              <strong>Hours:</strong> 24/7 Support Available
            </div>
          </div>
        </div>
      </section>

      <footer className="footer">
        <p>&copy; 2026 P&K Backend Automation. All rights reserved.</p>
      </footer>
    </>
  );
}
