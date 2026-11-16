import React, { useRef } from 'react';
import { UploadCloud, X } from 'lucide-react';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (files: File[]) => void;
  targetPath: string;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onUpload,
  targetPath,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onUpload(Array.from(e.target.files));
      onClose();
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onUpload(Array.from(e.dataTransfer.files));
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] flex items-center justify-center p-4">
      <div className="bg-surface-card border border-surface-border rounded-lg max-w-sm w-full p-5 shadow-xl relative text-content-primary">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-content-muted hover:text-content-primary p-1 rounded transition"
        >
          <X className="w-4 h-4" />
        </button>

        <h3 className="font-semibold text-sm">파일 업로드</h3>
        <p className="text-[11px] text-content-muted mt-0.5 truncate">
          위치: <span className="font-mono text-content-secondary">{targetPath || '/'}</span>
        </p>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="mt-4 border border-dashed border-surface-border hover:border-accent rounded-lg p-6 flex flex-col items-center justify-center text-center cursor-pointer bg-surface-base hover:bg-surface-cardHover transition"
        >
          <UploadCloud className="w-8 h-8 text-content-muted mb-2 stroke-[1.25]" />
          <p className="text-xs font-normal text-content-secondary">
            클릭하여 파일 선택 또는 드래그 앤 드롭
          </p>

          <input
            type="file"
            multiple
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      </div>
    </div>
  );
};
