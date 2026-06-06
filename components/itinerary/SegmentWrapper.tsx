'use client';

import type { ReactNode } from 'react';

export function SegmentWrapper({
  segmentId,
  children,
}: {
  segmentId: string;
  children: ReactNode;
}) {
  function handleMouseEnter() {
    window.dispatchEvent(
      new CustomEvent('segment-hover', { detail: { segmentId, active: true } }),
    );
  }

  function handleMouseLeave() {
    window.dispatchEvent(
      new CustomEvent('segment-hover', { detail: { segmentId, active: false } }),
    );
  }

  return (
    <div onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      {children}
    </div>
  );
}
