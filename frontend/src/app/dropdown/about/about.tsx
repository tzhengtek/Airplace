"use client";

import {
  Description,
  Dialog,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { X } from "lucide-react";
import { useAppContext } from "@/app/context/AppContext";

export function About() {
  const { isAboutOpen, setIsAboutOpen } = useAppContext();

  return (
    <Dialog
      open={isAboutOpen}
      onClose={() => setIsAboutOpen(false)}
      className="relative z-50"
    >
      <div className="fixed inset-0 flex w-screen items-center justify-center p-4 overflow-y-auto">
        <DialogPanel className="w-full max-w-md rounded-md bg-white p-10 text-black shadow-xl/50">
          <div className="flex items-center justify-between pb-4 border-b border-gray-200">
            <DialogTitle className="flex font-bold text-3xl">About</DialogTitle>
            <X
              onClick={() => setIsAboutOpen(false)}
              className="size-8 bg-transparent rounded-lg text-gray-400 hover:text-black justify-center cursor-pointer"
            />
          </div>
          <div className="mt-6">
            <Description as="div" className="text-gray-700 flex flex-col gap-4">
              <div>There is an empty canvas.</div>
              <div>
                You can place a pixel there, but you must wait to place another
                one.
              </div>
              <div>
                Individually, you can create something. Together, you can create
                something more. 🥳
              </div>
            </Description>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
