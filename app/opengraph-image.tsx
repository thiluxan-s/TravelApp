import { ImageResponse } from 'next/og';

export const alt = 'Wayfare — your travel second brain';

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#09090c',
          position: 'relative',
        }}
      >
        {/* Subtle amber grid */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(rgba(196,145,74,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(196,145,74,0.04) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        {/* Top-left corner accent */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: 3,
            height: 60,
            background: '#c4914a',
            opacity: 0.7,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: 60,
            height: 3,
            background: '#c4914a',
            opacity: 0.7,
          }}
        />
        {/* Content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            padding: '0 96px',
            position: 'relative',
          }}
        >
          <div
            style={{
              color: '#c4914a',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              marginBottom: 24,
            }}
          >
            WAYFARE
          </div>
          <div
            style={{
              color: '#e4ded4',
              fontSize: 56,
              fontWeight: 700,
              lineHeight: 1.15,
              marginBottom: 20,
            }}
          >
            Your travel second brain.
          </div>
          <div
            style={{
              color: '#5a5550',
              fontSize: 24,
              letterSpacing: '0.02em',
            }}
          >
            Upload your bookings. See your trip come together.
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
