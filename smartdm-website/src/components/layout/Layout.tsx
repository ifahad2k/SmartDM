import React, { useState, useEffect } from 'react';
import { Header } from './Header';
import { Footer } from './Footer';
import { Check } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [scrollPercent, setScrollPercent] = useState(0);
  const [cursorPos, setCursorPos] = useState({ x: -500, y: -500 });
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max > 0) {
        setScrollPercent((window.scrollY / max) * 100);
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      setCursorPos({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('pointermove', handlePointerMove, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('pointermove', handlePointerMove);
    };
  }, []);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <div className="noise" aria-hidden="true" />

      <div
        className="cursor-glow"
        aria-hidden="true"
        style={{ left: `${cursorPos.x}px`, top: `${cursorPos.y}px` }}
      />

      <div className="scroll-progress" aria-hidden="true">
        <span style={{ width: `${scrollPercent}%` }} />
      </div>

      <Header />

      <main id="main-content">
        {React.Children.map(children, (child) => {
          if (React.isValidElement(child)) {
            return React.cloneElement(child, { triggerToast } as any);
          }
          return child;
        })}
      </main>

      <Footer />

      <div className={`toast ${toastMessage ? 'show' : ''}`} role="status">
        <Check size={18} />
        <span>{toastMessage || 'Copied to clipboard'}</span>
      </div>
    </>
  );
};
