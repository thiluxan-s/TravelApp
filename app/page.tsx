import Link from 'next/link';
import type { Metadata } from 'next';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Wayfare',
  description:
    'Upload your booking PDFs and see your trip come together — flights, hotels, and map in one view.',
};

export default async function LandingPage() {
  const { userId } = await auth();
  if (userId) redirect('/trips');
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=Instrument+Sans:opsz,wght@4..22,300;4..22,400;4..22,500&display=swap');

        .lp {
          font-family: 'Instrument Sans', system-ui, sans-serif;
          background: #09090C;
          color: #E4DED4;
          min-height: 100svh;
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: hidden;
        }

        .lp-display {
          font-family: 'Cormorant Garamond', Georgia, serif;
        }

        /* Ambient gradients */
        .lp-glow {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            radial-gradient(ellipse 70% 55% at 15% 65%, rgba(176, 118, 55, 0.07) 0%, transparent 55%),
            radial-gradient(ellipse 45% 55% at 80% 20%, rgba(70, 90, 140, 0.05) 0%, transparent 55%);
        }

        /* Subtle dot-grid texture */
        .lp-grid {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background-image: radial-gradient(circle, rgba(228, 222, 212, 0.06) 1px, transparent 1px);
          background-size: 28px 28px;
          mask-image: radial-gradient(ellipse 80% 80% at 50% 50%, black 0%, transparent 100%);
        }

        /* Staggered fade-up entries */
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(22px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .fu {
          opacity: 0;
          animation: fade-up 0.75s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .fu-0 { animation-delay: 0.05s; }
        .fu-1 { animation-delay: 0.18s; }
        .fu-2 { animation-delay: 0.32s; }
        .fu-3 { animation-delay: 0.46s; }
        .fu-4 { animation-delay: 0.62s; }
        .fu-5 { animation-delay: 0.78s; }

        .lp-nav-wordmark {
          font-family: 'Cormorant Garamond', Georgia, serif;
          font-size: 0.9375rem;
          font-weight: 400;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #C4914A;
        }

        .lp-headline {
          font-size: clamp(3.75rem, 10.5vw, 8.25rem);
          font-weight: 300;
          line-height: 0.92;
          letter-spacing: -0.025em;
          color: #E4DED4;
        }

        .lp-headline em {
          font-style: italic;
          color: #C4914A;
        }

        .lp-rule {
          height: 1px;
          width: 38%;
          background: linear-gradient(to right, rgba(196, 145, 74, 0.35), transparent);
        }

        .lp-tagline {
          font-size: 1.0625rem;
          font-weight: 300;
          line-height: 1.75;
          color: #857C6F;
          max-width: 34ch;
        }

        .lp-eyebrow {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          font-size: 0.6875rem;
          font-weight: 500;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: #7A7265;
        }

        .lp-eyebrow::before {
          content: '';
          display: block;
          width: 1.75rem;
          height: 1px;
          background: #7A7265;
          flex-shrink: 0;
        }

        .lp-btn-primary {
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          text-decoration: none !important;
          background: #C4914A !important;
          color: #09090C !important;
          border-radius: 3px !important;
          height: 2.875rem !important;
          padding: 0 2rem !important;
          font-size: 0.875rem !important;
          font-weight: 500 !important;
          letter-spacing: 0.04em;
          border: none !important;
          transition: background 0.2s ease, transform 0.15s ease !important;
        }

        .lp-btn-primary:hover {
          background: #D4A05A !important;
          transform: translateY(-1px);
        }

        .lp-btn-ghost {
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          text-decoration: none !important;
          background: transparent !important;
          color: #857C6F !important;
          border: 1px solid rgba(196, 145, 74, 0.18) !important;
          border-radius: 3px !important;
          height: 2.875rem !important;
          padding: 0 2rem !important;
          font-size: 0.875rem !important;
          font-weight: 400 !important;
          transition: border-color 0.2s ease, color 0.2s ease, transform 0.15s ease !important;
        }

        .lp-btn-ghost:hover {
          border-color: rgba(196, 145, 74, 0.38) !important;
          color: #C4B08A !important;
          background: transparent !important;
          transform: translateY(-1px);
        }

        .lp-footer-text {
          font-size: 0.6875rem;
          color: #3E3A34;
          letter-spacing: 0.05em;
        }
      `}</style>

      <div className="lp">
        <div className="lp-glow" aria-hidden />
        <div className="lp-grid" aria-hidden />

        {/* Decorative route map */}
        <svg
          aria-hidden
          viewBox="0 0 700 550"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{
            position: 'absolute',
            right: '-4%',
            bottom: '-4%',
            width: 'min(58vw, 620px)',
            opacity: 0.038,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          {/* Topographic curves */}
          <path d="M 40 500 Q 180 280 360 200 T 660 120" stroke="#E4DED4" strokeWidth="1" />
          <path d="M 10 540 Q 160 320 340 240 T 690 160" stroke="#E4DED4" strokeWidth="0.5" />
          <path d="M 80 460 Q 220 240 400 160 T 680 70" stroke="#E4DED4" strokeWidth="0.5" />
          <path d="M 120 420 Q 250 210 430 130 T 700 30" stroke="#E4DED4" strokeWidth="0.35" />
          {/* Route line between destinations */}
          <path
            d="M 180 340 C 260 280 320 220 360 200 C 420 175 480 150 540 138"
            stroke="#C4914A"
            strokeWidth="1"
            strokeDasharray="5 4"
          />
          {/* Location dots */}
          <circle cx="178" cy="341" r="5" fill="#C4914A" />
          <circle cx="360" cy="200" r="4" fill="#E4DED4" />
          <circle cx="540" cy="138" r="5" fill="#C4914A" />
          {/* Pulse rings */}
          <circle cx="178" cy="341" r="10" stroke="#C4914A" strokeWidth="0.75" />
          <circle cx="540" cy="138" r="10" stroke="#C4914A" strokeWidth="0.75" />
        </svg>

        {/* Nav */}
        <nav
          className="fu fu-0 relative z-10 flex items-center justify-between"
          style={{ padding: '1.5rem 2.5rem' }}
        >
          <span className="lp-nav-wordmark">Wayfare</span>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <Link href="/sign-in" className="lp-btn-ghost">
              Sign in
            </Link>
            <Link href="/sign-up" className="lp-btn-primary">
              Get started
            </Link>
          </div>
        </nav>

        {/* Hero */}
        <main
          className="relative z-10 flex-1 flex items-center"
          id="main-content"
          style={{ padding: '3rem 2.5rem 4rem' }}
        >
          <div style={{ maxWidth: '860px' }}>
            <p className="fu fu-1 lp-eyebrow" style={{ marginBottom: '2.75rem' }}>
              Travel second brain
            </p>

            <h1 className="fu fu-2 lp-display lp-headline" style={{ marginBottom: '1.5rem' }}>
              Your itinerary,<br />
              <em>finally clear.</em>
            </h1>

            <div className="fu fu-3 lp-rule" style={{ marginBottom: '2rem' }} />

            <p className="fu fu-4 lp-tagline" style={{ marginBottom: '3rem' }}>
              Upload your booking confirmation PDFs.<br />
              Get a unified daily itinerary with a map.
            </p>

            <div className="fu fu-5" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <Link href="/sign-up" className="lp-btn-primary">
                Start for free
              </Link>
              <Link href="/demo" className="lp-btn-ghost">
                See a live demo →
              </Link>
              <Link href="/sign-in" className="lp-btn-ghost">
                Sign in →
              </Link>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer
          className="fu fu-5 relative z-10"
          style={{ padding: '1.25rem 2.5rem' }}
        >
          <p className="lp-footer-text">Portfolio project by Thiluxan · {new Date().getFullYear()}</p>
        </footer>
      </div>
    </>
  );
}
