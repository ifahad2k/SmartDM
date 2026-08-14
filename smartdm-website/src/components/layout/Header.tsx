import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Download, Star, Menu, X, ShieldCheck, LogOut, ChevronDown, User } from 'lucide-react';
import { GithubIcon as Github } from '../GithubIcon';
import { smartdmConfig } from '../../config/smartdmConfig';
import { useAuth } from '../../context/AuthContext';
import { fetchGitHubRepositoryData } from '../../services/githubSyncService';

export const Header: React.FC = () => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [starCount, setStarCount] = useState<string>('Star');
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const { user, logout } = useAuth();
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
    { name: 'Ideas & Upvotes', path: '/community/ideas' },
    { name: 'Documentation', path: '/docs/install' },
    { name: 'Security', path: '/docs/security' },
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
                      <Link 
                        to="/feedback/bug" 
                        className="button button-small button-secondary"
                        onClick={() => setUserDropdownOpen(false)}
                        style={{ fontSize: '0.75rem', justifyContent: 'flex-start', color: 'var(--danger)' }}
                      >
                        <User size={14} /> Report a Bug
                      </Link>
                      <Link 
                        to="/feedback/feature" 
                        className="button button-small button-secondary"
                        onClick={() => setUserDropdownOpen(false)}
                        style={{ fontSize: '0.75rem', justifyContent: 'flex-start', color: 'var(--primary)' }}
                      >
                        <User size={14} /> Propose an Idea
                      </Link>
                      <Link 
                        to="/account/submissions" 
                        className="button button-small button-secondary"
                        onClick={() => setUserDropdownOpen(false)}
                        style={{ fontSize: '0.75rem', justifyContent: 'flex-start' }}
                      >
                        <User size={14} /> My Submissions & Status
                      </Link>
                      <Link 
                        to="/account/profile" 
                        className="button button-small button-secondary"
                        onClick={() => setUserDropdownOpen(false)}
                        style={{ fontSize: '0.75rem', justifyContent: 'flex-start' }}
                      >
                        <User size={14} /> Account Settings
                      </Link>
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
