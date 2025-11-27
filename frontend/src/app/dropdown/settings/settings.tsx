"use client";

import {
  Description,
  Dialog,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { X, RotateCcw } from "lucide-react";
import { useAppContext } from "@/app/context/AppContext";

export function Settings() {
  const { isSettingsOpen, setIsSettingsOpen, resetCanvas } = useAppContext();

  const handleReset = () => {
    resetCanvas();
    setIsSettingsOpen(false);
  };

  return (
    <Dialog
      open={isSettingsOpen}
      onClose={() => setIsSettingsOpen(false)}
      className="relative z-50"
    >
      <div className="fixed inset-0 flex w-screen items-center justify-center p-4 overflow-y-auto">
        <DialogPanel className="w-full max-w-md rounded-md bg-white p-10 text-black shadow-xl/50">
          <div className="flex items-center justify-between pb-4 border-b border-gray-200">
            <DialogTitle className="flex font-bold text-3xl">
              Settings
            </DialogTitle>
            <X
              onClick={() => setIsSettingsOpen(false)}
              className="size-8 bg-transparent rounded-lg text-gray-400 hover:text-black justify-center cursor-pointer"
            />
          </div>
          <div className="mt-6">
            <Description as="div" className="text-gray-700 flex flex-col gap-4">
              <button
                onClick={handleReset}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors duration-300 font-semibold"
              >
                <RotateCcw className="w-5 h-5" />
                Reset Canvas
              </button>
            </Description>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
