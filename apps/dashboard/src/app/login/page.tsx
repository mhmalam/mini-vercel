import LoginForm from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>
          <span className="brand-mark">▼</span> mini-vercel
        </h1>
        <p className="muted">
          This control plane can deploy and stop applications on the server —
          it needs the dashboard password.
        </p>
        <LoginForm />
      </div>
    </div>
  );
}
