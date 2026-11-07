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
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#1c1c24] border border-[#2d2d3d] rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white p-1"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-white font-semibold text-lg">파일 업로드</h3>
        <p className="text-gray-400 text-xs mt-1">
          업로드 위치: <span className="text-blue-400 font-mono">{targetPath || '/'}</span>
        </p>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="mt-5 border-2 border-dashed border-[#38384d] hover:border-blue-500 rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer bg-[#15151c]/60 hover:bg-[#1f1f2a] transition group"
        >
          <div className="w-14 h-14 rounded-2xl bg-blue-600/10 group-hover:bg-blue-600/20 text-blue-400 flex items-center justify-center mb-3 transition">
            <UploadCloud className="w-8 h-8" />
          </div>
          <p className="text-sm font-medium text-gray-200">
            클릭하여 파일을 선택하거나 여기로 드래그하세요
          </p>
          <p className="text-xs text-gray-500 mt-1">대용량 동영상, 사진, 문서 지원</p>

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
