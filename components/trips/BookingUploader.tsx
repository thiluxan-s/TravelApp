'use client';

import { useOptimistic, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  requestBookingUploadAction,
  confirmBookingUploadedAction,
} from '@/app/(app)/trips/[tripId]/actions';

const ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
]);
const MAX_SIZE = 10 * 1024 * 1024;

type PendingUpload = {
  tempId: string;
  fileName: string;
  status: 'uploading' | 'parsing' | 'error';
  progress: number;
  error?: string;
};

function uploadViaXhr(
  url: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed with status ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.send(file);
  });
}

export function BookingUploader({
  tripId,
  onUploadComplete,
}: {
  tripId: string;
  onUploadComplete?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [, startTransition] = useTransition();
  const [pending, updatePending] = useOptimistic(
    [] as PendingUpload[],
    (current: PendingUpload[], update: PendingUpload) => {
      const idx = current.findIndex((p) => p.tempId === update.tempId);
      if (idx === -1) return [...current, update];
      return current.map((p, i) => (i === idx ? update : p));
    },
  );

  function processFile(file: File) {
    const tempId = crypto.randomUUID();

    if (!ALLOWED_TYPES.has(file.type)) {
      toast.error(`${file.name}: only PDF, JPEG, PNG, WEBP, HEIC allowed`);
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error(`${file.name}: must be 10 MB or smaller`);
      return;
    }

    startTransition(async () => {
      updatePending({ tempId, fileName: file.name, status: 'uploading', progress: 0 });

      const presignResult = await requestBookingUploadAction({
        tripId,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      });

      if (!presignResult.ok) {
        updatePending({ tempId, fileName: file.name, status: 'error', progress: 0, error: presignResult.error });
        toast.error(`${file.name}: ${presignResult.error}`);
        return;
      }

      const { uploadUrl, bookingId } = presignResult.data;

      try {
        await uploadViaXhr(uploadUrl, file, (pct) => {
          updatePending({ tempId, fileName: file.name, status: 'uploading', progress: pct });
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed';
        updatePending({ tempId, fileName: file.name, status: 'error', progress: 0, error: msg });
        toast.error(`${file.name}: ${msg}`);
        return;
      }

      const confirmResult = await confirmBookingUploadedAction(bookingId);
      if (!confirmResult.ok) {
        updatePending({ tempId, fileName: file.name, status: 'error', progress: 0, error: confirmResult.error });
        toast.error(`${file.name}: ${confirmResult.error}`);
        return;
      }

      updatePending({ tempId, fileName: file.name, status: 'parsing', progress: 100 });
      onUploadComplete?.();
    });
  }

  function handleFiles(files: FileList | null) {
    if (!files) return;
    Array.from(files).forEach((file) => processFile(file));
  }

  return (
    <div className="space-y-2">
      {/* Pending upload cards */}
      {pending.map((p) => (
        <div key={p.tempId} className="flex items-center gap-3 bg-card border border-border rounded-md px-3 py-2.5">
          <div className="w-8 h-8 rounded bg-muted flex items-center justify-center flex-shrink-0">
            {p.status === 'uploading' && (
              <span className="block w-4 h-4 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
            )}
            {p.status === 'parsing' && <span>📄</span>}
            {p.status === 'error' && <span className="text-destructive text-sm">✕</span>}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{p.fileName}</p>
            {p.status === 'uploading' && (
              <p className="text-xs text-muted-foreground">Uploading… {p.progress}%</p>
            )}
            {p.status === 'parsing' && (
              <p className="text-xs text-amber-500">Parsing with AI…</p>
            )}
            {p.status === 'error' && (
              <p className="text-xs text-destructive">{p.error ?? 'Upload failed'}</p>
            )}
          </div>
        </div>
      ))}

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false);
        }}
        onDrop={(e) => { e.preventDefault(); setIsDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        className={`border border-dashed rounded-md px-4 py-5 text-center cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          isDragOver
            ? 'border-foreground/50 bg-muted/50'
            : 'border-border hover:border-foreground/30 hover:bg-muted/20'
        }`}
      >
        <p className="text-sm text-muted-foreground">Drop PDFs or images here</p>
        <p className="text-xs text-muted-foreground/70 mt-0.5">
          or <span className="underline">click to browse</span> · PDF, JPEG, PNG, WEBP, HEIC · max 10 MB
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
          multiple
          className="sr-only"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
