"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { ErrorBanner } from "@/components/ui/Banner";

/**
 * `auth.register` on the server has always worked - there was just no page
 * that called it, so new members had no way to sign themselves up. This
 * wires up the existing endpoint; it doesn't change what it does.
 */
export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  const register = trpc.auth.register.useMutation({
    onSuccess: () => {
      router.push("/login");
    },
  });

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Create an account</h1>

      <form
        className="panel space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          register.mutate({
            name,
            email,
            password,
            phone: phone.trim() ? phone.trim() : undefined,
          });
        }}
      >
        <div className="space-y-1.5">
          <label className="text-sm muted">Name</label>
          <input
            className="input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm muted">Email</label>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm muted">Phone (optional)</label>
          <input
            className="input"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm muted">Password</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
          <p className="muted text-xs">At least 6 characters.</p>
        </div>

        {register.error && <ErrorBanner message={register.error.message} />}

        <button
          className="btn btn-primary w-full"
          type="submit"
          disabled={register.isPending}
        >
          {register.isPending ? "Creating account..." : "Create account"}
        </button>

        <p className="text-center text-sm muted">
          Already have an account?{" "}
          <Link href="/login" className="hover:text-white" style={{ color: "var(--text)" }}>
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
