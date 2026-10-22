"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePoll } from "@/components/use-poll";
import { cn } from "@/lib/utils";

type Kind = "spec" | "docs";
const NAME = /^[a-z][a-z0-9_-]{1,40}$/;

type Props = { repo: string; busy: boolean; onStart: (command: string, name: string) => void };

/** The GraphOS start form, on the New connector page: a spec or docs link in, a workspace out. */
export function NewConnector({ repo, busy, onStart }: Props) {
  const [kind, setKind] = useState<Kind>("spec");
  const [name, setName] = useState("");
  const [source, setSource] = useState("");
  const [special, setSpecial] = useState(false);
  const [env, setEnv] = useState("");
  const [demoErr, setDemoErr] = useState<string | null>(null);
  const q = encodeURIComponent(repo);
  const { data: demo } = usePoll<{ running: boolean; apiVersion?: number; port: number; available: boolean }>(`/api/graphos-demo?repo=${q}`, 4000);

  const demoCall = async (body: unknown) => {
    setDemoErr(null);
    const res = await fetch(`/api/graphos-demo?repo=${q}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) setDemoErr((await res.json()).error ?? "Failed.");
  };
  const valid = NAME.test(name) && source.trim() !== "" && !/\s/.test(source.trim()) && (env === "" || /^[A-Z][A-Z0-9_]*$/.test(env));
  const submit = () => {
    if (!valid || busy) return;
    const flag = kind === "spec" ? `--spec ${source.trim()}` : `--docs ${source.trim()}`;
    onStart(`/graphos new ${name} ${flag} --context ${special ? "specialized" : "generic"}${kind === "docs" && env ? ` --env ${env}` : ""}`, name);
  };
  const fillDemo = (k: Kind) => {
    setKind(k);
    setName(k === "spec" ? "lumen_books" : "lumen_docs");
    setSource(k === "spec" ? "demo/graphos/openapi.v1.json" : `http://127.0.0.1:${demo?.port ?? 4010}/docs`);
    setEnv(k === "docs" ? "LUMEN_TOKEN" : "");
    setSpecial(false);
  };

  return (
    <div className="mx-auto mb-2 w-full max-w-3xl space-y-3 rounded-xl bg-card p-4 shadow-raised" data-testid="gx-new">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-label text-muted-foreground">Source</span>
        <Button size="sm" variant={kind === "spec" ? "primary" : "default"} onClick={() => setKind("spec")}>OpenAPI / Swagger</Button>
        <Button size="sm" variant={kind === "docs" ? "primary" : "default"} onClick={() => setKind("docs")}>Docs link, no spec</Button>
        <Button size="sm" variant="default" disabled tooltip="gRPC, databases and existing GraphQL APIs are planned upstream, not built yet">gRPC · DB · GraphQL (soon)</Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input placeholder="Connector name, e.g. orders_api" value={name} onChange={(e) => setName(e.target.value.toLowerCase())} aria-label="Connector name" />
        <Input placeholder={kind === "spec" ? "Spec file or URL (openapi.json)" : "Docs URL"} value={source} onChange={(e) => setSource(e.target.value)} aria-label="Source" />
      </div>
      {kind === "docs" && <Input placeholder="Credential variable for probing (optional), e.g. LUMEN_TOKEN" value={env} onChange={(e) => setEnv(e.target.value)} aria-label="Credential variable" />}
      <label className="flex items-center gap-2 text-body-sm text-muted-foreground">
        <input type="checkbox" checked={special} onChange={(e) => setSpecial(e.target.checked)} />
        Customer-specific fields (custom objects, tenant metadata)
      </label>
      <Button variant="primary" disabled={!valid || busy} data-testid="gx-start" onClick={submit}>Start</Button>
      {demo?.available && (
        <div className={cn("space-y-2 rounded-lg bg-background p-3 shadow-inset")} data-testid="gx-demo">
          <div className="flex flex-wrap items-center gap-2 text-caption">
            <span className="text-muted-foreground">Demo: Lumen Books API</span>
            <span className={cn("rounded-full px-2 py-0.5", demo.running ? "bg-badge-green-subtle text-badge-green-foreground" : "bg-fill-subtle text-muted-foreground")}>{demo.running ? `running v${demo.apiVersion} :${demo.port}` : "stopped"}</span>
            <Button size="sm" variant="default" onClick={() => demoCall({ action: "start", version: 1 })}>Start v1</Button>
            <Button size="sm" variant="default" onClick={() => demoCall({ action: "start", version: 2 })}>Start v2</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-caption">
            <span className="text-muted-foreground">Fill in:</span>
            <Button size="sm" variant="default" data-testid="gx-fill-spec" onClick={() => fillDemo("spec")}>spec</Button>
            <Button size="sm" variant="default" data-testid="gx-fill-docs" onClick={() => fillDemo("docs")}>docs only</Button>
          </div>
          {demoErr && <p className="text-caption text-destructive-foreground">{demoErr}</p>}
        </div>
      )}
    </div>
  );
}
