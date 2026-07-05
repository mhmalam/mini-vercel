"use client";

import { useActionState } from "react";
import { LogIn } from "lucide-react";
import { login, type LoginState } from "@/lib/actions";

const initialState: LoginState = {};

export default function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);
  return (
    <form className="login-form" action={formAction}>
      <label>
        password
        <input
          name="password"
          type="password"
          required
          autoFocus
          autoComplete="current-password"
          placeholder="••••••••••••"
        />
      </label>
      {state.error && <p className="form-error">{state.error}</p>}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        <span className="icon-label">
          <LogIn size={13} />
          {pending ? "checking…" : "sign in"}
        </span>
      </button>
    </form>
  );
}
