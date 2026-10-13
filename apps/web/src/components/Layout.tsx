import { useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="Sparkle Wash home">
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill="#0b2545" />
        <path d="M32 12c-7 10-14 18-14 26a14 14 0 0 0 28 0c0-8-7-16-14-26z" fill="#13c4c4" />
        <circle cx="26" cy="38" r="4" fill="#fff" opacity=".8" />
      </svg>
      Sparkle Wash
    </Link>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const onHome = pathname === '/';
  const anchor = (id: string) => (onHome ? `#${id}` : `/#${id}`);

  return (
    <>
      <header className="site-header">
        <div className="container">
          <Logo />
          <button className="menu-btn" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)}>☰</button>
          <nav className={`site-nav ${open ? 'open' : ''}`} onClick={() => setOpen(false)}>
            <a href={anchor('how')}>How it works</a>
            <a href={anchor('pricing')}>Pricing</a>
            <a href={anchor('memberships')}>Memberships</a>
            <a href={anchor('hubs')}>Hubs</a>
            {user ? (
              <>
                <NavLink to="/bookings">My bookings</NavLink>
                <NavLink to="/account">Account</NavLink>
              </>
            ) : (
              <NavLink to="/login">Sign in</NavLink>
            )}
            <Link to="/book" className="btn small teal">Book a wash</Link>
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <footer className="site-footer">
        <div className="container">
          <div>
            <Logo />
            <p style={{ marginTop: 10 }}>Hand car washes at your home, office or one of our hubs.</p>
          </div>
          <div>
            <b>Get the app</b>
            <p>Sparkle Wash for iPhone and Android<br />Sparkle Wash Pro for washers</p>
          </div>
          <div>
            <b>Company</b>
            <p><Link to="/terms">Terms</Link> · <Link to="/privacy">Privacy</Link><br />© {new Date().getFullYear()} Sparkle Wash</p>
          </div>
        </div>
      </footer>
    </>
  );
}
