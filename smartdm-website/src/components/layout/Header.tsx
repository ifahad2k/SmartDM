import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Download, Star, Menu, X, ShieldCheck, UserCheck, LogOut, ChevronDown, User } from 'lucide-react';
import { GithubIcon as Github } from '../GithubIcon';
import { smartdmConfig } from '../../config/smartdmConfig';
import { useAuth } from '../../context/AuthContext';
import { fetchGitHubRepositoryData } from '../../services/githubSyncService';

export const Header: React.FC = () => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [starCount, setStarCount] = useState<string>('Star');
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
    fetchGitHubRepositoryData()
      .then((data) => {
        if (data.starText) {
          setStarCount(data.starText);
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
      {/* DEBUG OVERLAY */}
      <div style={{ position: 'absolute', top: 0, left: 0, background: 'red', color: 'white', zIndex: 9999, fontSize: '10px', padding: '2px' }}>
        DEBUG UID: {user?.uid} | IS_ADMIN: {user?.isAdmin ? 'YES' : 'NO'}
      </div>
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

          {/* User Profile / Auth */}
          <div className="user-menu-wrap">
            {user ? (
              <>
                <button
                  className="icon-link"
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  title={`${user.displayName} (${user.role})`}
                  aria-expanded={userDropdownOpen}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div className="avatar-badge">{user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U'}</div>
                    <ChevronDown size={14} />
                  </div>
                </button>

                {userDropdownOpen && (
                  <div className="user-menu-dropdown">
                    <div className="user-info-row">
                      <div className="avatar-badge">{user.displayName?.charAt(0).toUpperCase() || 'U'}</div>
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
                      {user.isAdmin && (
                        <Link 
                          to="/admin" 
                          className="button button-small button-secondary"
                          onClick={() => setUserDropdownOpen(false)}
                          style={{ fontSize: '0.75rem', justifyContent: 'flex-start', background: 'var(--surface-light)' }}
                        >
                          <ShieldCheck size={14} /> Admin Dashboard
                        </Link>
                      )}
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
                  </div>
                )}
              </>
            ) : (
              <Link to="/login" className="button button-small button-secondary" style={{ padding: '0.5rem 1rem' }}>
                <User size={16} /> Sign In
              </Link>
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
