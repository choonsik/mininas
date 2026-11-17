import React, { useRef } from 'react';
import { UploadCloud, X, FolderUp, FileUp } from 'lucide-react';
import { getFilesFromDataTransfer, UploadFileEntry } from '../utils/fileSystem';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (files: (File | UploadFileEntry)[]) => void;
  targetPath: string;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onUpload,
  targetPath,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onUpload(Array.from(e.target.files));
      onClose();
    }
  };

  const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      const entries: UploadFileEntry[] = files.map(file => ({
        file,
        relativePath: (file as any).webkitRelativePath || file.name,
      }));
      onUpload(entries);
      onClose();
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      const entries = await getFilesFromDataTransfer(e.dataTransfer.items);
      if (entries.length > 0) {
        onUpload(entries);
        onClose();
        return;
      }
    }
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
          title="닫기"
        >
          <X className="w-4 h-4" />
        </button>

        <h3 className="font-semibold text-sm">업로드</h3>
        <p className="text-[11px] text-content-muted mt-0.5 truncate">
          위치: <span className="font-mono text-content-secondary">{targetPath || '/'}</span>
        </p>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="mt-4 border border-dashed border-surface-border hover:border-accent rounded-lg p-5 flex flex-col items-center justify-center text-center cursor-pointer bg-surface-base hover:bg-surface-cardHover transition"
        >
          <UploadCloud className="w-8 h-8 text-content-muted mb-2 stroke-[1.25]" />
          <p className="text-xs font-normal text-content-secondary">
            파일 또는 폴더를 드래그 앤 드롭하세요
          </p>
          <p className="text-[10px] text-content-muted mt-1">
            대용량 및 다중 파일 자동 분할 전송
          </p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-surface-base border border-surface-border hover:bg-surface-cardHover text-xs text-content-primary transition"
          >
            <FileUp className="w-3.5 h-3.5 text-content-muted" />
            <span>파일 선택</span>
          </button>

          <button
            type="button"
            onClick={() => folderInputRef.current?.click()}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-surface-base border border-surface-border hover:bg-surface-cardHover text-xs text-content-primary transition"
          >
            <FolderUp className="w-3.5 h-3.5 text-accent" />
            <span>폴더 선택</span>
          </button>
        </div>

        <input
          type="file"
          multiple
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
        />

        <input
          type="file"
          multiple
          ref={folderInputRef}
          onChange={handleFolderChange}
          className="hidden"
          {...({ webkitdirectory: '', directory: '' } as any)}
        />
      </div>
    </div>
  );
};
