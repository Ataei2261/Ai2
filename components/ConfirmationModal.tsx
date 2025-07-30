import React from 'react';
import { AlertTriangle, Check, X as CloseIcon } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
}) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50 transition-opacity duration-150 ease-in-out"
      aria-modal="true"
      role="dialog"
      aria-labelledby="confirmation-modal-title"
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md transform transition-all duration-150 ease-in-out scale-100">
        <div className="p-6">
          <div className="flex items-start">
            <div className="flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
              <AlertTriangle className="h-6 w-6 text-red-600" aria-hidden="true" />
            </div>
            <div className="ms-4 text-left rtl:text-right">
              <h3 className="text-lg leading-6 font-semibold text-gray-900" id="confirmation-modal-title">
                {title}
              </h3>
              <div className="mt-2">
                <div className="text-sm text-gray-600">{message}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse gap-2">
          <button
            type="button"
            className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ms-3 sm:w-auto sm:text-sm transition-colors"
            onClick={() => {
              onConfirm();
              onClose(); 
            }}
          >
            <Check className="me-2 h-5 w-5 sm:hidden" />
            تایید
          </button>
          <button
            type="button"
            className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 sm:mt-0 sm:w-auto sm:text-sm transition-colors"
            onClick={onClose}
          >
            <CloseIcon className="me-2 h-5 w-5 sm:hidden" />
            انصراف
          </button>
        </div>
      </div>
    </div>
  );
};
