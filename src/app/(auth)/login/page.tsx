"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { appPath, createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    if (!isSupabaseConfigured()) {
      setMessage("Add Supabase URL and anon key first. See SUPABASE_SETUP.md in the project.");
      return;
    }
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    window.location.href = appPath("/dashboard/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4 sm:p-6">
      <Card className="w-full max-w-md rounded-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 h-16 w-16 sm:h-20 sm:w-20 overflow-hidden rounded-full border bg-white p-1">
  <img src={appPath("/logo.png")} alt="AKY logo" className="h-full w-full object-contain" />
</div>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Use your existing Supabase account from the shared database.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={signIn}>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="you@example.com" required />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required />
            </div>
            <Button className="w-full" type="submit" disabled={loading}>{loading ? "Signing in..." : "Continue"}</Button>
            {message ? <p className="text-sm text-red-700">{message}</p> : null}
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
