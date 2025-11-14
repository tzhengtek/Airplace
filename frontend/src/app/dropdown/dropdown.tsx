"use client";

import React, { JSX, useState } from "react";
import {
  Description,
  Dialog,
  DialogPanel,
  DialogTitle,
  Field,
  Input,
  Label,
  Fieldset,
  Button,
  Checkbox,
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
} from "@headlessui/react";
import { CheckIcon, X, EllipsisVertical } from "lucide-react";
import clsx from "clsx";

export function Dropdown(): JSX.Element {
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  const menuItems = [
    { label: "Settings", onClick: () => {} },
    { label: "About", onClick: () => {} },
    { label: "Account", onClick: () => setIsLoginOpen(true) },
  ];

  return (
    <div className="fixed top-3 z-[10000]">
      <Menu as="div" className="relative inline-block">
        <MenuButton className="mt-12 ml-12 flex items-center justify-center rounded-full size-12 bg-white text-sm font-semibold text-black data-focus:text-blue hover:bg-blue-100">
          <EllipsisVertical className="w-6 h-6" />
        </MenuButton>

        <MenuItems
          transition
          className="mt-2 w-56 rounded-md outline-1 bg-white transition data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in"
        >
          <div className="py-1">
            {menuItems.map((item) => (
              <MenuItem key={item.label}>
                <button
                  type="button"
                  onClick={item.onClick}
                  className="block w-full text-left px-4 py-2 text-sm text-black data-[focus]:bg-blue-100 data-[focus]:text-black"
                >
                  {item.label}
                </button>
              </MenuItem>
            ))}
          </div>
        </MenuItems>
      </Menu>

      <Dialog
        open={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        className="relative z-50"
      >
        <div className="fixed inset-0 flex w-screen items-center justify-center p-4 overflow-y-auto">
          <DialogPanel className="w-full max-w-md rounded-md bg-white p-10 text-black">
            <div className="flex items-center justify-between pb-4 border-b border-gray-200">
              <DialogTitle className="font-bold text-3xl">Sign in</DialogTitle>
              <X
                onClick={() => setIsLoginOpen(false)}
                className="size-8 bg-transparent hover:bg-blue-100 rounded-lg text-gray-400 hover:text-black justify-center cursor-pointer"
              />
            </div>

            <Description as="div" className="pt-4 w-full">
              <Fieldset className="rounded-xl bg-white">
                <Field>
                  <Label className="font-medium text-black">Username</Label>
                  <Input
                    className={clsx(
                      "mt-3 block w-full outline-2 outline-offset-2 outline-gray-200 rounded-lg bg-white/5 py-1.5 text-sm/6 text-black",
                      "data-focus:outline-2 data-focus:outline-offset-2 data-focus:outline-blue-100"
                    )}
                  />
                </Field>
                <Field>
                  <Label className="font-medium text-black">Password</Label>
                  <Input
                    type="password"
                    className={clsx(
                      "mt-3 block w-full outline-2 -outline-offset-2 outline-gray-200 rounded-lg bg-white/5 py-1.5 text-sm/6 text-black",
                      "data-focus:outline-2 data-focus:-outline-offset-2 data-focus:outline-blue-100"
                    )}
                  />
                </Field>
              </Fieldset>
            </Description>

            <div className="mt-4">
              <Checkbox className="group size-6 rounded-md bg-white/10 p-1 ring-1 ring-white/15 ring-inset focus:not-data-focus:outline-none data-checked:bg-white data-focus:outline data-focus:outline-offset-2 data-focus:outline-white">
                <CheckIcon className="hidden size-4 fill-black group-data-checked:block" />
              </Checkbox>
            </div>

            <div className="mt-6 flex justify-between">
              <Button>Sign in</Button>
              <Button onClick={() => setIsLoginOpen(false)}>Cancel</Button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </div>
  );
}
