import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { signIn } from "@/app/owner/actions";
import { ActionForm } from "@/components/owner/action-form";
import { Field, Panel } from "@/components/owner/frame";
import { PageShell } from "@/components/site/page-shell";
import { DotLabel } from "@/components/site/primitives";
import { ownerEnabled, SECRET_MIN_LENGTH } from "@/lib/owner";
import { isOwner } from "@/lib/owner-session";

export const metadata: Metadata = { title: "Sign in" };

// Whether someone is signed in is read from the request before anything is sent.
export const instant = false;

export default async function OwnerLogin() {
  if (await isOwner()) redirect("/owner");

  return (
    <PageShell>
      <div className="mx-auto max-w-xl">
        <div className="px-3 pb-8 md:px-4">
          <DotLabel>Owner</DotLabel>
          <h1 className="mt-5 text-4xl leading-[1.02] font-medium tracking-[-0.04em] md:text-5xl">Sign in</h1>
        </div>
        <SignIn />
      </div>
    </PageShell>
  );
}

function SignIn() {
  if (!ownerEnabled()) {
    return (
      <Panel>
        <p className="label-mono text-muted-foreground">Switched off</p>
        <p className="mt-4 leading-relaxed">
          The owner&apos;s screens are off on this server. They turn on when{" "}
          <span className="font-mono text-sm text-brand">OWNER_SECRET</span> is set to a secret of at
          least {SECRET_MIN_LENGTH} characters, where the server runs.
        </p>
      </Panel>
    );
  }

  return (
    <Panel>
      <ActionForm action={signIn} label="Sign in" busyLabel="Checking" size="lg" className="space-y-6">
        <Field
          label="The owner's secret"
          name="secret"
          type="password"
          autoComplete="current-password"
          required
          hint="The one set on the server. It opens these screens and nothing else: it is not a key to any wallet."
        />
      </ActionForm>
    </Panel>
  );
}
