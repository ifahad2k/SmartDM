import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Download, Star, Menu, X, ShieldCheck, UserCheck, LogOut, ChevronDown, User } from 'lucide-react';
import { GithubIcon as Github } from '../GithubIcon';
import { smartdmConfig } from '../../config/smartdmConfig';
import { useAuth } from '../../context/AuthContext';

export const Header: React.FC = () => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [starCount, setStarCount] = useState<string>('1.4k');
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const { user, loginAsAdmin, loginAsUser, logout } = useAuth();
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 18);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    fetch(`https://api.github.com/repos/${smartdmConfig.githubOwner}/SmartDM`)
      .then((res) => res.json())
      .then((data) => {
        if (data && typeof data.stargazers_count === 'number') {
          const count = data.stargazers_count;
          setStarCount(count >= 1000 ? `${(count / 1000).toFixed(1)}k` : `${count}`);
        }
      })
      .catch(() => {});
  }, []);

  const navLinks = [
    { name: 'Features', path: '/#features' },
    { name: 'Download', path: '/#download' },
    { name: 'Documentation', path: '/docs/install' },
    { name: 'Security', path: '/docs/security' },
    { name: 'Community', path: '/#community' },
  ];

  return (
    <header className={`site-header ${scrolled ? 'scrolled' : ''}`}>
      <div className="container nav-wrap">
        <Link to="/" className="brand" aria-label="SmartDM Home">
          <img src="/assets/logo-full.png" alt="SmartDM Logo" className="brand-logo-img" />
        </Link>

        <nav className="desktop-nav" aria-label="Primary Navigation">
          {navLinks.map((link) => {
            const isDocs = link.path.startsWith('/docs');
            const isActive = isDocs ? location.pathname.startsWith('/docs') : location.pathname === '/' && location.hash === link.path.replace('/', '');
            return (
              <a
                key={link.name}
                href={link.path}
                className={isActive ? 'active' : ''}
              >
                {link.name}
              </a>
            );
          })}
        </nav>

        <div className="nav-actions">
          {/* GitHub Star Pill */}
          <a
            className="icon-link github-repo-link"
            href={smartdmConfig.githubRepo}
            target="_blank"
            rel="noreferrer"
            aria-label="Star SmartDM on GitHub"
          >
            <Github size={18} />
            <span className="star-pill" aria-label="GitHub Star Count">
              <Star size={12} fill="currentColor" /> {starCount}
            </span>
          </a>

          {/* Primary Download Button */}
          <a className="button button-small button-primary" href="/#download">
            <Download size={16} />
            <span>Download</span>
          </a>

          {/* User Profile / Admin Badge Menu */}
          <div className="user-menu-wrap">
            <button
              className="icon-link"
              onClick={() => setUserDropdownOpen(!userDropdownOpen)}
              title={user ? `${user.displayName} (${user.role})` : 'User Menu'}
              aria-expanded={userDropdownOpen}
            >
              {user ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div className="avatar-badge">{user.displayName ? user.displayName.charAt(0) : 'U'}</div>
                  <ChevronDown size={14} />
                </div>
              ) : (
                <User size={18} />
              )}
            </button>

            {userDropdownOpen && (
              <div className="user-menu-dropdown">
                {user ? (
                  <>
                    <div className="user-info-row">
                      <div className="avatar-badge">{user.displayName?.charAt(0) || 'U'}</div>
                      <div className="user-details">
                        <strong>{user.displayName}</strong>
                        <small>{user.email}</small>
                        {user.isAdmin && (
                          <span className="admin-tag">
                            <ShieldCheck size={12} /> Admin Access
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <button
                        className="button button-small button-secondary"
                        onClick={() => {
                          loginAsUser();
                          setUserDropdownOpen(false);
                        }}
                        style={{ fontSize: '0.75rem', justifyContent: 'flex-start' }}
                      >
                        <UserCheck size={14} /> Switch to Contributor
                      </button>
                      <button
                        className="button button-small button-secondary"
                        onClick={() => {
                          loginAsAdmin();
                          setUserDropdownOpen(false);
                        }}
                        style={{ fontSize: '0.75rem', justifyContent: 'flex-start' }}
                      >
                        <ShieldCheck size={14} /> Switch to Admin
                      </button>
                      <button
                        className="button button-small button-secondary"
                        onClick={() => {
                          logout();
                          setUserDropdownOpen(false);
                        }}
                        style={{ fontSize: '0.75rem', justifyContent: 'flex-start', color: 'var(--danger)' }}
                      >
                        <LogOut size={14} /> Sign Out
                      </button>
                    </div>
                  </>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '6px' }}>
                    <small style={{ color: 'var(--muted)' }}>Select user session context:</small>
                    <button
                      className="button button-small button-primary"
                      onClick={() => {
                        loginAsAdmin();
                        setUserDropdownOpen(false);
                      }}
                    >
                      <ShieldCheck size={14} /> Login as Admin
                    </button>
                    <button
                      className="button button-small button-secondary"
                      onClick={() => {
                        loginAsUser();
                        setUserDropdownOpen(false);
                      }}
                    >
                      <UserCheck size={14} /> Login as Contributor
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Mobile Drawer Button */}
          <button
            className="menu-button"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle navigation menu"
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      <div className={`mobile-panel ${mobileOpen ? 'open' : ''}`}>
        {navLinks.map((link) => (
          <a
            key={link.name}
            href={link.path}
            onClick={() => setMobileOpen(false)}
          >
            {link.name}
          </a>
        ))}
      </div>
    </header>
  );
};
