"use client";
import { useEffect, useMemo, useState } from "react";
import { MessageResponse } from "@/components/ai-elements/message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { navItemClasses } from "@/lib/ds/sidebar-nav-item-classes";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { usePoll } from "@/components/use-poll";
import { cn } from "@/lib/utils";
import type { Decision, Operation, Workspace } from "@/lib/graphos";

type Tab = "scope" | "decisions" | "validate" | "schema" | "record";
const TABS: { key: Tab; label: string }[] = [
  { key: "scope", label: "Scope" },
  { key: "decisions", label: "Decisions" },
  { key: "validate", label: "Validate" },
  { key: "schema", label: "Schema" },
  { key: "record", label: "Record" },
];
const STAGE_TAB: Record<string, Tab> = { inventory: "scope", scope: "scope", design: "decisions", apply: "schema", validate: "validate", export: "validate" };

type Props = { name: string | null; repo: string; working: boolean; busy: boolean; onClose: () => void; onCommand: (text: string) => void };

const METHOD_STYLE: Record<string, string> = { GET: "text-success-indicator", POST: "text-warning-indicator", PATCH: "text-warning-indicator", PUT: "text-warning-indicator", DELETE: "text-destructive-indicator" };

export function WorkspaceDialog({ name, repo, working, busy, onClose, onCommand }: Props) {
  const q = encodeURIComponent(repo);
  const { data: ws } = usePoll<Workspace>(name ? `/api/graphos/${encodeURIComponent(name)}?repo=${q}` : null, 3000);
  const [tab, setTab] = useState<Tab | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setTab(null); setError(null); }, [name]);
  const shown: Tab = tab ?? (ws ? STAGE_TAB[ws.state.stage] ?? "scope" : "scope");

  // Writes go through the skill's own CLI on the server; the poll shows the result.
  const post = async (body: unknown) => {
    setError(null);
    const res = await fetch(`/api/graphos/${encodeURIComponent(name!)}?repo=${q}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const out = await res.json();
    if (!res.ok) { setError(out.error ?? `HTTP ${res.status}`); return false; }
    return true;
  };
  const run = (verb: string, rest = "") => onCommand(`/graphos ${verb} ${name}${rest ? ` ${rest}` : ""}`);
  const locked = busy || working;

  return (
    <Dialog open={!!name} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[88vh] max-w-6xl flex-col gap-3 sm:max-w-6xl" data-testid="gx-dialog">
        {name && !ws && <DialogHeader><DialogTitle className="font-mono">{name}</DialogTitle><DialogDescription>Loading…</DialogDescription></DialogHeader>}
        {name && ws && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2 font-mono">
                {name}
                {ws.state.gate && !ws.state.exported && <Badge variant="pink" size="sm" indicator="pulse">your call</Badge>}
                {ws.state.refresh && <Badge variant="warning" size="sm">API changed</Badge>}
                {ws.state.exported && <Badge variant="success" size="sm">exported</Badge>}
              </DialogTitle>
              <DialogDescription>{ws.api.title}{ws.api.version && !/unversion/i.test(ws.api.version) ? ` v${ws.api.version}` : ""} · {ws.state.reason}</DialogDescription>
            </DialogHeader>
            {working && <p role="status" className="flex items-center gap-2 rounded-xl bg-fill-subtle px-3 py-2 text-body-sm"><Spinner /> An agent is working on this connector. This view updates by itself.</p>}
            {!ws.state.gate && ws.state.next && !working && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl bg-card px-3 py-2 text-body-sm shadow-raised" data-testid="gx-next">
                <span className="text-muted-foreground">Next:</span> <span className="font-medium">{ws.state.next.replace("graphos-", "")}</span>
                <span className="min-w-0 flex-1 truncate text-caption text-muted-foreground">{ws.state.reason}</span>
                <Button size="sm" variant="primary" disabled={locked} data-testid="gx-continue" onClick={() => run("continue")}>Run next step</Button>
              </div>
            )}
            {error && <p role="alert" className="rounded-xl bg-badge-red-subtle px-3 py-2 text-body-sm text-badge-red-foreground">{error}</p>}
            <div className="flex min-h-0 flex-1 gap-3">
              <nav className="w-44 shrink-0 space-y-1 text-body-sm" aria-label="Connector sections">
                {TABS.map((t) => {
                  const open = t.key === "decisions" ? ws.state.decisions.open : 0;
                  return (
                    <button key={t.key} onClick={() => setTab(t.key)} aria-pressed={shown === t.key} data-testid={`gx-tab-${t.key}`} className={navItemClasses({ isActive: shown === t.key, size: "sm" })}>
                      {t.label}
                      {open > 0 && <span className="ml-auto rounded-full bg-brand-pink px-1.5 text-meta text-white">{open}</span>}
                    </button>
                  );
                })}
              </nav>
              <article className="min-w-0 flex-1 overflow-y-auto rounded-xl bg-background p-4 text-body-sm shadow-inset">
                {shown === "scope" && <ScopeTab ws={ws} locked={locked} post={post} run={run} />}
                {shown === "decisions" && <DecisionsTab ws={ws} locked={locked} post={post} run={run} />}
                {shown === "validate" && <ValidateTab ws={ws} locked={locked} run={run} />}
                {shown === "schema" && <SchemaTab ws={ws} locked={locked} run={run} />}
                {shown === "record" && <RecordTab ws={ws} locked={locked} run={run} />}
              </article>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

type TabProps = { ws: Workspace; locked: boolean; run: (verb: string, rest?: string) => void };
type Post = (body: unknown) => Promise<boolean>;

// ---------------------------------------------------------------- Scope

function ScopeTab({ ws, locked, post, run }: TabProps & { post: Post }) {
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState("");
  const scope = ws.decisions.find((d) => d.phase === "scope");
  const open = scope?.status === "open";
  const on = (o: Operation) => pending[o.key] ?? o.include === true;
  const changes = Object.entries(pending).filter(([k, v]) => ws.operations.find((o) => o.key === k)?.include !== v);
  const groups = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const by = new Map<string, Operation[]>();
    for (const o of ws.operations) {
      if (f && !`${o.path} ${o.summary} ${o.operationId} ${o.tags.join(" ")}`.toLowerCase().includes(f)) continue;
      const tag = o.tags[0] ?? "Other";
      by.set(tag, [...(by.get(tag) ?? []), o]);
    }
    return [...by.entries()];
  }, [ws.operations, filter]);
  const picked = ws.operations.filter(on).length;
  const hasSelection = ws.operations.some((o) => o.include !== null);

  if (!hasSelection)
    return <p className="p-6 text-body-sm text-muted-foreground">{ws.operations.length} operations found. The selector has not proposed a scope yet: it drafts a small starter list for you to adjust.</p>;

  return (
    <div className="space-y-3" data-testid="gx-scope">
      <div className="flex flex-wrap items-center gap-2 text-body-sm">
        <Input className="w-56" placeholder="Filter operations" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter operations" />
        <span className="text-muted-foreground">{picked} of {ws.operations.length} in scope</span>
        <span className="ml-auto flex items-center gap-2">
          {changes.length > 0 && (
            <Button size="sm" variant="secondary" disabled={locked} data-testid="gx-save-scope"
              onClick={async () => { if (await post({ action: "selection", ops: changes.map(([key, include]) => ({ key, include })) })) setPending({}); }}>
              Save {changes.length} change{changes.length === 1 ? "" : "s"}
            </Button>
          )}
          {open && (
            <Button size="sm" disabled={locked || changes.length > 0 || picked === 0} data-testid="gx-confirm-scope" title={changes.length ? "Save your changes first" : undefined}
              onClick={async () => { if (await post({ action: "resolve", id: scope!.id, chosen: [scope!.choices[0]?.id ?? "confirm"], note: `${picked} operations` })) run("continue"); }}>
              Confirm scope ({picked})
            </Button>
          )}
        </span>
      </div>
      {groups.map(([tag, ops]) => (
        <section key={tag} className="rounded-xl bg-card shadow-raised">
          <h3 className="border-b border-border px-3 py-1.5 text-eyebrow uppercase text-muted-foreground">{tag}</h3>
          <ul>
            {ops.map((o) => (
              <li key={o.key} className="flex items-start gap-3 border-b border-border px-3 py-2 last:border-b-0">
                <input type="checkbox" className="mt-1 size-4 " checked={on(o)} disabled={locked || !open}
                  aria-label={`Include ${o.method} ${o.path}`} data-testid={`gx-op-${o.operationId}`}
                  onChange={(e) => setPending((p) => ({ ...p, [o.key]: e.target.checked }))} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-body-sm">
                    <span className={cn("w-14 font-mono text-caption font-semibold", METHOD_STYLE[o.method] ?? "")}>{o.method}</span>
                    <span className="font-mono text-caption">{o.path}</span>
                    {o.graphqlName && <Badge variant="neutral" size="sm">{o.root ?? "query"} · {o.graphqlName}</Badge>}
                    {o.deprecated && <Badge variant="warning" size="sm">deprecated</Badge>}
                    {o.readHint && <Badge variant="warning" size="sm" title={o.readHint}>may be a read</Badge>}
                    {o.support && o.support !== "supported" && <Badge variant="warning" size="sm" title="The skill cannot map this operation cleanly">{o.support.replace("_", " ")}</Badge>}
                  </div>
                  <p className="text-caption text-muted-foreground">{o.summary}{o.include === false && o.reason ? ` · left out: ${o.reason}` : ""}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {!open && <p className="text-caption text-muted-foreground">Scope is confirmed. To change it later, ask the selector again from the Record tab or edit the selection and re-run.</p>}
    </div>
  );
}

// ---------------------------------------------------------------- Decisions

function DecisionCard({ d, locked, post }: { d: Decision; locked: boolean; post: Post }) {
  const [chosen, setChosen] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const toggle = (id: string) => setChosen((c) => (d.multiple ? (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]) : [id]));
  return (
    <section className="space-y-2 rounded-xl bg-card p-3 shadow-raised [--surface-rim:var(--brand-pink)]" data-testid={`gx-decision-${d.id}`}>
      <div className="flex items-center gap-2">
        <h3 className="text-body-sm font-medium">{d.title}</h3>
        {d.phase && <Badge variant="neutral" size="sm">{d.phase}</Badge>}
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">{d.id}</span>
      </div>
      {d.question && <p className="text-body-sm">{d.question}</p>}
      {d.context && <p className="text-caption text-muted-foreground">{d.context}</p>}
      <div className="space-y-1" role={d.multiple ? "group" : "radiogroup"} aria-label={d.title}>
        {d.choices.map((c) => (
          <label key={c.id} className={cn("flex cursor-pointer items-start gap-2 rounded-lg bg-fill-subtle px-2.5 py-1.5 text-body-sm cursor-pointer", chosen.includes(c.id) && "[--surface-rim:var(--border-strong)] bg-fill-subtle")}>
            <input type={d.multiple ? "checkbox" : "radio"} name={d.id} className="mt-1 " checked={chosen.includes(c.id)} onChange={() => toggle(c.id)} />
            <span><span className="font-medium">{c.label}</span>{c.detail && <span className="block text-caption text-muted-foreground">{c.detail}</span>}</span>
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <Input className="flex-1" placeholder="Why (kept in the decision record)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Reason" />
        <Button size="sm" disabled={locked || chosen.length === 0} data-testid={`gx-answer-${d.id}`} onClick={() => post({ action: "resolve", id: d.id, chosen, note })}>Save answer</Button>
      </div>
    </section>
  );
}

function DecisionsTab({ ws, locked, post, run }: TabProps & { post: Post }) {
  const open = ws.decisions.filter((d) => d.status === "open" && d.phase !== "scope");
  const settled = ws.decisions.filter((d) => d.status !== "open");
  const label = (d: Decision) => (d.resolution?.chosen ?? []).map((id) => d.choices.find((c) => c.id === id)?.label ?? id).join(", ");
  return (
    <div className="space-y-4" data-testid="gx-decisions">
      {open.length === 0 && <p className="text-body-sm text-muted-foreground">{ws.state.stage === "design" && !ws.state.gate ? "The selector is still working out the design questions." : "No open questions."}</p>}
      {open.map((d) => <DecisionCard key={d.id} d={d} locked={locked} post={post} />)}
      {settled.length > 0 && (
        <section>
          <h3 className="mb-1 text-eyebrow uppercase text-muted-foreground">Settled ({settled.length})</h3>
          <ul className="divide-y divide-border rounded-xl bg-card shadow-raised">
            {settled.map((d) => (
              <li key={d.id} className="px-3 py-2 text-body-sm">
                <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{d.title}</span><Badge variant="neutral" size="sm">{label(d) || d.status}</Badge>
                  {d.resolution?.by && <span className="text-[11px] text-muted-foreground">by {d.resolution.by}{d.resolution.at ? ` · ${d.resolution.at}` : ""}</span>}</div>
                {d.resolution?.note && <p className="text-caption text-muted-foreground">{d.resolution.note}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Validate

type Evidence = {
  run_at?: string;
  layers?: Record<string, { status?: string; reason?: string; cases?: number; failed?: number }>;
  operations?: Record<string, Record<string, string>>;
};
const LAYER_LABEL: Record<string, string> = {
  compose: "Composition", connector_unit: "Connector unit tests", wiremock_e2e: "Mocked Router run", write_body_proof: "Write-body proof",
  spec_conformance: "Spec conformance", lint: "Lint", json_accounting: "JSON accounting", live: "Live API run", supergraph_check: "Your supergraph",
};
const CHIP: Record<string, string> = {
  pass: "bg-badge-green-subtle text-badge-green-foreground", fail: "bg-badge-red-subtle text-badge-red-foreground",
  not_run: "bg-fill-subtle text-muted-foreground", skipped: "bg-fill-subtle text-muted-foreground",
};

function ValidateTab({ ws, locked, run }: TabProps) {
  const ev = ws.evidence as Evidence | null;
  const [base, setBase] = useState("");
  const [note, setNote] = useState("");
  const [liveUrl, setLiveUrl] = useState(ws.api.baseUrls[0] ?? "");
  const [liveEnv, setLiveEnv] = useState("LUMEN_TOKEN");
  const [composeCfg, setComposeCfg] = useState("demo/graphos/others/supergraph.demo.yaml");
  const layers = Object.entries(ev?.layers ?? {});
  const ops = Object.entries(ev?.operations ?? {});
  const cols = [...new Set(ops.flatMap(([, v]) => Object.keys(v)))];
  return (
    <div className="space-y-4" data-testid="gx-validate">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" disabled={locked || ws.state.stage === "inventory" || ws.state.stage === "scope" || ws.state.stage === "design"} data-testid="gx-run-validation" onClick={() => run("validate")}>{ev ? "Run validation again" : "Run validation"}</Button>
        {ws.state.stage === "validate" && ws.state.gate && (
          <>
            <Input className="w-72" placeholder="What should the author change?" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Fix note" />
            <Button size="sm" disabled={locked || !note.trim()} onClick={() => { run("fix", JSON.stringify(note.trim())); setNote(""); }}>Ask the author to fix</Button>
          </>
        )}
        {ev?.run_at && <span className="text-caption text-muted-foreground">last run {ev.run_at}</span>}
      </div>
      {ev && (
        <section className="space-y-2 rounded-xl bg-card shadow-raised p-3" data-testid="gx-live">
          <h3 className="text-body-sm font-medium">Live check against the real API</h3>
          <p className="text-caption text-muted-foreground">Runs every selected read against the service and compares it with the spec. The credential comes from an environment variable of the process that starts agents; it is never written to the workspace. Writes are left out.</p>
          <div className="flex flex-wrap gap-2">
            <Input className="min-w-60 flex-1" value={liveUrl} onChange={(e) => setLiveUrl(e.target.value)} aria-label="Live base URL" />
            <Input className="w-44" value={liveEnv} onChange={(e) => setLiveEnv(e.target.value)} aria-label="Credential variable name" />
            <Button size="sm" variant="secondary" disabled={locked || !/^https?:\/\/\S+$/.test(liveUrl.trim()) || !/^[A-Z][A-Z0-9_]*$/.test(liveEnv)} data-testid="gx-live-go" onClick={() => run("validate", `--live-url ${liveUrl.trim()} --env ${liveEnv}`)}>Run live check</Button>
          </div>
        </section>
      )}
      {!ev && <p className="text-body-sm text-muted-foreground">Nothing has been validated yet.</p>}
      {layers.length > 0 && (
        <ul className="divide-y divide-border rounded-xl bg-card shadow-raised">
          {layers.map(([k, l]) => (
            <li key={k} className="flex flex-wrap items-center gap-3 px-3 py-2 text-body-sm" data-testid={`gx-layer-${k}`}>
              <span className="w-52 font-medium">{LAYER_LABEL[k] ?? k}</span>
              <span className={cn("rounded-md px-1.5 py-0.5 text-[11px]", CHIP[l.status ?? ""] ?? "")}>{(l.status ?? "unknown").replace("_", " ")}</span>
              {l.cases !== undefined && <span className="text-caption text-muted-foreground">{l.cases} cases{l.failed ? `, ${l.failed} failed` : ""}</span>}
              {l.reason && <span className="min-w-0 flex-1 truncate text-caption text-muted-foreground" title={l.reason}>{l.reason}</span>}
            </li>
          ))}
        </ul>
      )}
      {ops.length > 0 && (
        <div className="overflow-x-auto rounded-xl bg-card shadow-raised">
          <table className="w-full text-left text-caption">
            <thead className="text-muted-foreground"><tr><th className="px-3 py-1.5 font-medium">Operation</th>{cols.map((c) => <th key={c} className="px-3 py-1.5 font-medium">{c}</th>)}</tr></thead>
            <tbody>
              {ops.map(([k, v]) => (
                <tr key={k} className="border-t border-border"><td className="px-3 py-1.5 font-mono">{k}</td>{cols.map((c) => <td key={c} className="px-3 py-1.5"><span className={cn("rounded-md px-1.5 py-0.5", CHIP[(v[c] ?? "").split(" ")[0]] ?? "text-muted-foreground")}>{v[c] ?? "-"}</span></td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {ev && ws.state.evidence && ws.state.evidence.not_run.length > 0 && (
        <p className="rounded-xl bg-fill-subtle px-3 py-2 text-caption text-muted-foreground">Not run: {ws.state.evidence.not_run.join(", ")}. A layer that did not run is not a pass, and the subgraph has not been checked against your own supergraph unless “Your supergraph” says pass.</p>
      )}
      {ws.review && (
        <section className="rounded-xl bg-card shadow-raised p-3 text-body-sm" data-testid="gx-review">
          <div className="mb-1 flex items-center gap-2">
            <h3 className="text-eyebrow uppercase text-muted-foreground">Schema review</h3>
            {ws.state.review && <Badge size="sm" variant={ws.state.review === "PASS" ? "success" : "warning"}>{ws.state.review}</Badge>}
            {ws.state.review === "CHANGES" && !ws.state.exported && (
              <Button size="sm" variant="secondary" className="ml-auto" disabled={locked} data-testid="gx-apply-review" onClick={() => run("fix", JSON.stringify("Apply the should-fix items in review.md that the decisions allow, then re-run validation."))}>Have the author apply it</Button>
            )}
          </div>
          <MessageResponse>{ws.review}</MessageResponse>
        </section>
      )}
      <section className="space-y-2 rounded-xl bg-card p-3 shadow-raised" data-testid="gx-compose">
        <h3 className="text-body-sm font-medium">Compose with your other subgraphs</h3>
        <p className="text-caption text-muted-foreground">A local stand-in for the check against your published graph, which needs your graph and key. It proves this subgraph composes with the others: shared entity names and key types agree. It is not a GraphOS check.</p>
        <div className="flex gap-2">
          <Input className="flex-1" value={composeCfg} onChange={(e) => setComposeCfg(e.target.value)} aria-label="Supergraph config" />
          <Button size="sm" variant="secondary" disabled={locked || !composeCfg.trim() || /\s/.test(composeCfg.trim())} data-testid="gx-compose-go" onClick={() => run("compose", `--with ${composeCfg.trim()}`)}>Compose</Button>
        </div>
        {ws.findings.filter((f) => f.title.startsWith("Composed with")).map((f) => (
          <p key={f.id} className="flex items-start gap-2 text-body-sm" data-testid="gx-compose-result">
            <Badge size="sm" variant={/: pass/i.test(f.title) ? "success" : "destructive"}>{/: pass/i.test(f.title) ? "composes" : "fails"}</Badge>
            <span className="min-w-0">{f.title}</span>
          </p>
        ))}
      </section>
      {ws.state.stage === "export" && (
        <section className="space-y-2 rounded-xl bg-card p-3 shadow-raised [--surface-rim:var(--brand-pink)]" data-testid="gx-export">
          <h3 className="text-body-sm font-medium">{ws.state.exported ? "Exported" : "Export the subgraph"}</h3>
          <p className="text-caption text-muted-foreground">Writes the subgraph with your production base URL and prints the rover commands. It never publishes; you run those.</p>
          <div className="flex gap-2">
            <Input className="flex-1" placeholder="https://api.your-company.com" value={base} onChange={(e) => setBase(e.target.value)} aria-label="Production base URL" />
            <Button size="sm" disabled={locked || !/^https?:\/\/\S+$/.test(base.trim())} data-testid="gx-export-go" onClick={() => run("export", `--base-url ${base.trim()} --live-url ${liveUrl.trim()} --env ${liveEnv}`)}>{ws.state.exported ? "Export again" : "Export"}</Button>
          </div>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Schema

function SchemaTab({ ws, locked, run }: TabProps) {
  return (
    <div className="space-y-3" data-testid="gx-schema">
      {ws.handEdits.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-badge-amber-subtle px-3 py-2 text-body-sm text-warning-foreground" data-testid="gx-handedit">
          <span>The schema was edited by hand ({ws.handEdits.length} span{ws.handEdits.length === 1 ? "" : "s"}). Record why, so the next apply keeps it.</span>
          <Button size="sm" className="ml-auto" disabled={locked} data-testid="gx-codify" onClick={() => run("codify")}>Codify the edit</Button>
        </div>
      )}
      {ws.schema ? (
        <section className="rounded-xl bg-card shadow-raised">
          <h3 className="border-b bg-muted/40 px-3 py-1.5 font-mono text-caption">{ws.schema.file}</h3>
          <pre className="max-h-[60vh] overflow-auto p-3 font-mono text-caption leading-relaxed">{ws.schema.text}</pre>
        </section>
      ) : <p className="text-body-sm text-muted-foreground">No schema file yet.</p>}
    </div>
  );
}

// ---------------------------------------------------------------- Record

function RecordTab({ ws, locked, run }: TabProps) {
  const [spec, setSpec] = useState("");
  const [env, setEnv] = useState("LUMEN_TOKEN");
  const [question, setQuestion] = useState("Why is the customer email not in the schema, and who decided that?");
  const reads = ws.operations.filter((o) => o.include === true && o.method === "GET");
  return (
    <div className="space-y-5" data-testid="gx-record">
      <section className="space-y-2 rounded-xl bg-card p-3 shadow-raised" data-testid="gx-ask">
        <h3 className="text-body-sm font-medium">Ask the record</h3>
        <p className="text-caption text-muted-foreground">A fresh agent that was not here reads only this workspace (its decisions, findings, notes and Git history) and answers with citations. This is how a teammate or another agent picks the work up.</p>
        <div className="flex gap-2">
          <Input className="flex-1" placeholder="Why is a field missing, who decided it, what changed in v2?" value={question} onChange={(e) => setQuestion(e.target.value)} aria-label="Question" />
          <Button size="sm" variant="secondary" disabled={locked || question.trim().length < 5} data-testid="gx-ask-go" onClick={() => run("ask", JSON.stringify(question.trim()))}>Ask</Button>
        </div>
      </section>
      <section className="space-y-2 rounded-xl bg-card shadow-raised p-3">
        <h3 className="text-body-sm font-medium">Check for API changes</h3>
        <p className="text-caption text-muted-foreground">Give it the newer spec. The reconciler refreshes the pinned source, shows what was added, deprecated or removed against your selection, and reopens the Apply stage.</p>
        <div className="flex gap-2">
          <Input className="flex-1" placeholder="Spec file or URL" value={spec} onChange={(e) => setSpec(e.target.value)} aria-label="New spec" />
          <Button size="sm" disabled={locked || !spec.trim() || /\s/.test(spec.trim())} data-testid="gx-refresh" onClick={() => run("refresh", `--spec ${spec.trim()}`)}>Refresh</Button>
        </div>
      </section>
      <section className="space-y-2 rounded-xl bg-card shadow-raised p-3">
        <h3 className="text-body-sm font-medium">Record live traffic</h3>
        <p className="text-caption text-muted-foreground">Records {reads.length} read operation{reads.length === 1 ? "" : "s"} from the real API as scrubbed fixtures and notes where it differs from the spec. The credential is read from an environment variable; its value never enters the workspace.</p>
        <div className="flex gap-2">
          <Input className="w-56" value={env} onChange={(e) => setEnv(e.target.value)} aria-label="Credential variable name" />
          <Button size="sm" variant="secondary" disabled={locked || reads.length === 0 || !/^[A-Z][A-Z0-9_]*$/.test(env)} data-testid="gx-record-go" onClick={() => run("record", `${reads.map((o) => o.key).join(" ")} --env ${env}`)}>Record</Button>
        </div>
      </section>
      <section>
        <h3 className="mb-1 text-eyebrow uppercase text-muted-foreground">Findings ({ws.findings.length})</h3>
        {ws.findings.length === 0 ? <p className="text-body-sm text-muted-foreground">None yet.</p> : (
          <ul className="divide-y divide-border rounded-xl bg-card shadow-raised">
            {ws.findings.map((f) => <li key={f.id} className="px-3 py-2 text-body-sm"><span className="font-medium">{f.title}</span>{f.body && <p className="whitespace-pre-wrap text-caption text-muted-foreground">{f.body}</p>}</li>)}
          </ul>
        )}
      </section>
      <section>
        <h3 className="mb-1 text-eyebrow uppercase text-muted-foreground">History in Git ({ws.commits.length})</h3>
        <ol className="space-y-0.5 font-mono text-caption">
          {ws.commits.map((c) => <li key={c.hash} className="flex gap-2"><span className="text-muted-foreground">{c.hash}</span><span className="min-w-0 flex-1 truncate">{c.subject}</span><span className="text-muted-foreground">{c.date.slice(0, 10)}</span></li>)}
        </ol>
        <p className="mt-2 text-caption text-muted-foreground">This record is the answer to why a field exists. It lives in the workspace’s own Git repo, so a teammate or another agent can pick it up from here.</p>
      </section>
      {ws.memory && <section className="rounded-xl bg-card shadow-raised p-3 text-body-sm"><h3 className="mb-1 text-eyebrow uppercase text-muted-foreground">Notes (memory.md)</h3><MessageResponse>{ws.memory}</MessageResponse></section>}
    </div>
  );
}
