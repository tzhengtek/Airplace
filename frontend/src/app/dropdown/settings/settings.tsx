"use client";

import {
  Description,
  Dialog,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { useState } from "react";
import { X, RotateCcw } from "lucide-react";
import { useAppContext } from "@/app/context/AppContext";

export function Settings() {
  const { isSettingsOpen, setIsSettingsOpen, resetCanvas } = useAppContext();

  const [showConfirmClear, setShowConfirmClear] = useState(false);

  const handleReset = () => {
    resetCanvas();
    setIsSettingsOpen(false);
  };

  const handleClearLocalStorage = () => {
    try {
      localStorage.removeItem("discord_token");
      localStorage.removeItem("discord_user");
      localStorage.removeItem("airplace_canvas_state");
    } catch (e) {
      console.error("Error clearing localStorage:", e);
    }
    resetCanvas();
    setShowConfirmClear(false);
    setIsSettingsOpen(false);
    window.dispatchEvent(new Event("storage"));
  };

  return (
    <>
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
              <Description
                as="div"
                className="text-gray-700 flex flex-col gap-4"
              >
                <button
                  onClick={handleReset}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors duration-300 font-semibold"
                >
                  <RotateCcw className="w-5 h-5" />
                  Reset Canvas
                </button>
                <button
                  onClick={() => setShowConfirmClear(true)}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg transition-colors duration-300 font-semibold"
                >
                  Clear Local Storage
                </button>
              </Description>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
      <Dialog
        open={showConfirmClear}
        onClose={() => setShowConfirmClear(false)}
        className="relative z-50"
      >
        <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
          <DialogPanel className="w-full max-w-sm rounded-md bg-white p-6 text-black shadow-xl animate-pop-in">
            <DialogTitle className="font-bold text-lg mb-4">
              Confirm Clear Local Storage
            </DialogTitle>
            <p className="text-gray-600 mb-6">
              Do you really want to clear local storage? This action cannot be
              undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleClearLocalStorage}
                className="flex-1 cursor-pointer justify-center text-white bg-red-500 px-4 py-2 rounded-lg font-medium text-sm hover:bg-red-600 transition-all ease-in duration-200"
              >
                Confirm
              </button>
              <button
                onClick={() => setShowConfirmClear(false)}
                className="flex-1 cursor-pointer justify-center text-gray-800 bg-gray-200 px-4 py-2 rounded-lg font-medium text-sm hover:bg-gray-300 transition-all ease-in duration-200"
              >
                Cancel
              </button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </>
  );
}
