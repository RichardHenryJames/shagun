"use client";

import { useFormStatus } from "react-dom";
import { LogOut } from "lucide-react";

export function SignOutButton() {
  const { pending } = useFormStatus();
  return <button type="submit" className="a-button a-button--quiet" disabled={pending}><LogOut size={16} aria-hidden="true" />{pending ? "Signing out…" : "Sign out"}</button>;
}