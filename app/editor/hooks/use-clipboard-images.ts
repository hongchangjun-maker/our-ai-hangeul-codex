import { useEffect } from 'react';

export function useClipboardImages(onFiles: (files: FileList) => void) {
  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      const images = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith('image/'));
      if (!images.length) return;
      event.preventDefault();
      const transfer = new DataTransfer(); images.forEach((file) => transfer.items.add(file)); onFiles(transfer.files);
    };
    addEventListener('paste', paste);
    return () => removeEventListener('paste', paste);
  }, [onFiles]);
}
