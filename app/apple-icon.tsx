import { ImageResponse } from 'next/og';

export const size = {
  width: 180,
  height: 180,
};

export const contentType = 'image/png';

export default function AppleIcon() {
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
        }}
      >
        <div
          style={{
            color: '#c4914a',
            fontSize: 112,
            fontWeight: 800,
            fontFamily: 'Georgia, serif',
            lineHeight: 1,
          }}
        >
          W
        </div>
      </div>
    ),
    { ...size },
  );
}
