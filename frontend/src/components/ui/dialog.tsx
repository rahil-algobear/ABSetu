"use client";

import { Fragment } from "react";
import {
  Dialog as HDialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from "@headlessui/react";
import { X } from "lucide-react";
import { cn } from "@/utils/cn";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function Dialog({ open, onClose, title, children, className }: DialogProps) {
  return (
    <Transition show={open} as={Fragment}>
      <HDialog onClose={onClose} className="relative z-50">
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/30" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <TransitionChild
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel
                className={cn(
                  "w-full max-w-md rounded-xl bg-white p-6 shadow-xl",
                  className
                )}
              >
                {title && (
                  <div className="flex items-center justify-between mb-4">
                    <DialogTitle className="text-lg font-semibold">
                      {title}
                    </DialogTitle>
                    <button
                      onClick={onClose}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <X size={18} />
                    </button>
                  </div>
                )}
                {children}
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </HDialog>
    </Transition>
  );
}
