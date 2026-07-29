"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronDown, Clipboard, Crosshair, ExternalLink, KeyRound, Loader2, Plus, RefreshCw, ShieldCheck, Upload, Wallet, X } from "lucide-react";
import { TransactionStatus, type Hash } from "genlayer-js/types";
import {
  contractAddress,
  explorerBase,
  makeGeneratedWallet,
  makeInjectedWriteClient,
  makeLocalWriteClient,
  makeReadClient,
  type Address,
  type ClaimRecord,
  type EvidenceRecord,
} from "@/lib/genlayer";
import { acknowledgeBrowserWallet, clearPrivateKey, hasAcknowledgedBrowserWallet, loadPrivateKey, loadTransactions, savePrivateKey, sortClaims, updateTx, upsertTx, type TrackedTx } from "@/lib/storage";
import { formatUtc, sha256Placeholder, shortAddress } from "@/lib/format";

type View = "overview" | "cases" | "funder" | "analyst" | "review" | "history" | "case" | "profile";
type Props = { view: View; caseId?: string; profileAddress?: string };
type WalletState = { ready: boolean; mode: "none" | "browser" | "injected"; address?: Address; privateKey?: `0x${string}`; menuOpen: boolean; needsAck: boolean; importValue: string };
type EvidenceForm = { kind: EvidenceRecord["kind"]; url: string; contentHash: string; note: string };

const zeroAddress = "0x0000000000000000000000000000000000000000";
const nav = [
  ["Docket", "/cases"],
  ["Open Claim", "/open"],
  ["Evidence Room", "/evidence"],
  ["Consensus", "/review"],
  ["My Trail", "/history"],
] as const;

export function AppShell({ view, caseId, profileAddress }: Props) {
  const [wallet, setWallet] = useState<WalletState>({ ready: false, mode: "none", menuOpen: false, needsAck: false, importValue: "" });
  const [claims, setClaims] = useState<ClaimRecord[]>([]);
  const [activeEvidence, setActiveEvidence] = useState<EvidenceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [txs, setTxs] = useState<TrackedTx[]>([]);
  const [busy, setBusy] = useState("");

  const activeClaim = useMemo(() => claims.find((item) => item.claim_id.toLowerCase() === (caseId ?? "").toLowerCase()), [claims, caseId]);
  const activeAddress = wallet.address?.toLowerCase();
  const myClaims = useMemo(() => {
    if (!activeAddress) return [];
    return claims.filter((claim) => claim.opener.toLowerCase() === activeAddress);
  }, [activeAddress, claims]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const client = makeReadClient();
      const count = BigInt(String(await client.readContract({ address: contractAddress, functionName: "get_claim_count", args: [] })));
      const page = (await client.readContract({ address: contractAddress, functionName: "get_claim_page", args: [0n, count > 20n ? 20n : count] })) as ClaimRecord[];
      setClaims(sortClaims(page ?? []));
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadEvidence = useCallback(async (claimId: string) => {
    try {
      const client = makeReadClient();
      const count = BigInt(String(await client.readContract({ address: contractAddress, functionName: "get_evidence_count", args: [claimId] })));
      const page = (await client.readContract({ address: contractAddress, functionName: "get_evidence_page", args: [claimId, 0n, count > 20n ? 20n : count] })) as EvidenceRecord[];
      setActiveEvidence(page ?? []);
    } catch {
      setActiveEvidence([]);
    }
  }, []);

  useEffect(() => {
    window.setTimeout(() => {
      const stored = loadPrivateKey();
      if (stored) {
        const client = makeLocalWriteClient(stored);
        setWallet({ ready: true, mode: "browser", address: client.account?.address as Address, privateKey: stored, menuOpen: false, needsAck: false, importValue: "" });
      } else {
        setWallet((current) => ({ ...current, ready: true, needsAck: !hasAcknowledgedBrowserWallet() }));
      }
      setTxs(loadTransactions());
      void refresh();
    }, 0);
  }, [refresh]);

  useEffect(() => {
    window.setTimeout(() => {
      if (activeClaim) void loadEvidence(activeClaim.claim_id);
    }, 0);
  }, [activeClaim, loadEvidence]);

  async function getWriteClient() {
    if (!wallet.address) throw new Error("EXPECTED: connect a wallet before writing.");
    if (wallet.mode === "browser" && wallet.privateKey) return makeLocalWriteClient(wallet.privateKey);
    if (wallet.mode === "injected") return makeInjectedWriteClient(wallet.address);
    throw new Error("EXPECTED: wallet is not ready.");
  }

  async function trackWrite(label: string, target: string | undefined, write: () => Promise<Hash>) {
    setBusy(label);
    setError("");
    try {
      const hash = await write();
      upsertTx({ hash, label, target, submittedAt: new Date().toISOString(), desired: "ACCEPTED", status: "PENDING" });
      setTxs(loadTransactions());
      const client = makeReadClient();
      await client.waitForTransactionReceipt({ hash, status: TransactionStatus.ACCEPTED, interval: 5000, retries: 90 });
      updateTx(hash, { status: "ACCEPTED" });
      setTxs(loadTransactions());
      await refresh();
      if (target) await loadEvidence(target);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy("");
    }
  }

  function useBrowserWallet() {
    acknowledgeBrowserWallet();
    const { privateKey, account } = makeGeneratedWallet();
    savePrivateKey(privateKey);
    setWallet({ ready: true, mode: "browser", address: account.address as Address, privateKey, menuOpen: false, needsAck: false, importValue: "" });
  }

  async function useInjectedWallet() {
    const ethereum = typeof window !== "undefined" ? window.ethereum : undefined;
    if (!ethereum) return setError("No injected wallet was detected in this browser.");
    const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as Address[];
    if (!accounts[0]) return setError("The injected wallet did not return an account.");
    setWallet({ ready: true, mode: "injected", address: accounts[0], menuOpen: false, needsAck: false, importValue: "" });
  }

  function importBrowserWallet() {
    const value = wallet.importValue.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(value)) return setError("Paste a private key as 0x plus 64 hex characters.");
    savePrivateKey(value as `0x${string}`);
    const client = makeLocalWriteClient(value as `0x${string}`);
    setWallet({ ready: true, mode: "browser", address: client.account?.address as Address, privateKey: value as `0x${string}`, menuOpen: false, needsAck: false, importValue: "" });
  }

  function disconnectWallet() {
    if (wallet.mode === "browser") clearPrivateKey();
    setWallet({ ready: true, mode: "none", menuOpen: false, needsAck: false, importValue: "" });
  }

  const common = { claims, loading, busy, activeAddress, getWriteClient, trackWrite, refresh };

  return (
    <div className="td-frame min-h-screen text-[var(--ink)]">
      <header className="td-mast sticky top-0 z-30 px-3 py-3 lg:px-6">
        <div className="mx-auto grid max-w-[92rem] gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/" className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-[50%_50%_50%_10%] border border-[var(--primary)] bg-[var(--primary-muted)] text-[var(--primary-muted-ink)]"><Crosshair size={21} /></span>
              <span><span className="display block text-2xl font-black">TrialDrift</span><span className="block text-[10px] font-black uppercase text-[var(--muted)]">Living claim docket</span></span>
            </Link>
            <div className="relative ml-auto flex items-center gap-2">
              <button className="button-primary" onClick={() => setWallet((current) => ({ ...current, menuOpen: !current.menuOpen }))}>{wallet.address ? <Check size={18} /> : <Wallet size={18} />}{wallet.address ? shortAddress(wallet.address) : "Connect wallet"}<ChevronDown size={16} /></button>
              {wallet.menuOpen ? (
                <div className="absolute right-0 top-full z-20 mt-2 w-80 border border-[var(--border-soft)] bg-[var(--surface)] p-3 shadow-lg">
                  <p className="label">{wallet.mode === "browser" ? "Browser wallet" : wallet.mode === "injected" ? "Injected wallet" : "No wallet"}</p>
                  <p className={`mt-1 text-sm ${wallet.address ? "break-all font-mono" : "leading-6 text-[var(--muted)]"}`}>{wallet.address ?? "Connect to open claims, add evidence, and resolve states."}</p>
                  <div className="mt-3 grid gap-2">
                    <button className="button-secondary" onClick={useInjectedWallet}><ShieldCheck size={16} /> Use injected</button>
                    <button className="button-secondary" onClick={useBrowserWallet}><KeyRound size={16} /> Use browser wallet</button>
                    {wallet.privateKey ? <button className="button-secondary" onClick={() => void navigator.clipboard.writeText(wallet.privateKey!)}><Clipboard size={16} /> Copy private key</button> : null}
                    <div className="flex gap-2"><input className="field" value={wallet.importValue} placeholder="Import private key" onChange={(event) => setWallet((current) => ({ ...current, importValue: event.target.value }))} /><button className="button-secondary" onClick={importBrowserWallet} aria-label="Import browser wallet"><Upload size={16} /></button></div>
                    {wallet.address ? <button className="button-secondary" onClick={disconnectWallet}><X size={16} /> Disconnect</button> : null}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <nav className="td-command flex gap-1 overflow-x-auto p-1">
            {nav.map(([label, href]) => <Link key={href} href={href} className={`td-tab shrink-0 ${isActive(view, href) ? "td-tab-active" : "hover:text-[var(--ink)]"}`}>{label}</Link>)}
          </nav>
        </div>
      </header>

      {wallet.needsAck ? <section className="mx-auto mt-4 max-w-[88rem] px-3 lg:px-6"><div className="td-command flex flex-col gap-3 bg-[var(--warning-bg)] p-4 md:flex-row md:items-center md:justify-between"><p className="text-sm">Browser wallets are stored only in this browser. Clearing site data destroys the key.</p><button className="button-secondary" onClick={useBrowserWallet}>Create browser wallet</button></div></section> : null}

      <main className="mx-auto max-w-[92rem] px-3 py-5 lg:px-6 lg:py-7">
        <PendingTransactions txs={txs} />
        {error ? <ErrorBox message={error} /> : null}
        {view === "overview" ? <Overview /> : null}
        {view === "cases" ? <DocketView {...common} /> : null}
        {view === "funder" ? <OpenClaimView {...common} /> : null}
        {view === "analyst" ? <EvidenceRoom {...common} /> : null}
        {view === "review" ? <ConsensusView {...common} /> : null}
        {view === "history" ? <TrailView claims={myClaims} loading={loading} refresh={refresh} /> : null}
        {view === "case" ? <ClaimDetail claim={activeClaim} evidence={activeEvidence} {...common} /> : null}
        {view === "profile" ? <ProfileView address={profileAddress} claims={claims} /> : null}
      </main>
    </div>
  );
}

type Common = { claims: ClaimRecord[]; loading: boolean; busy: string; activeAddress?: string; refresh: () => Promise<void>; getWriteClient: () => Promise<ReturnType<typeof makeReadClient>>; trackWrite: (label: string, target: string | undefined, write: () => Promise<Hash>) => Promise<void> };

function isActive(view: View, href: string) {
  return (href === "/cases" && view === "cases") || href.includes(view) || (href === "/open" && view === "funder") || (href === "/evidence" && view === "analyst");
}

function Overview() {
  return (
    <div className="mx-auto max-w-6xl">
      <section className="relative min-h-[68vh] py-10 md:py-16">
        <Link href="/cases" className="td-tab td-tab-active absolute left-0 top-0">Open the docket</Link>
        <div className="mx-auto mt-16 max-w-4xl text-center">
          <div className="mx-auto grid size-20 place-items-center rounded-[50%_50%_50%_14%] border border-[var(--primary)] bg-[var(--primary-muted)] text-[var(--primary-muted-ink)]"><Crosshair size={34} /></div>
          <p className="label mt-6 text-[var(--primary-muted-ink)]">A GenLayer claim-state instrument</p>
          <h1 className="display mt-5 text-5xl font-black leading-[0.9] md:text-8xl">TRIALDRIFT</h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-[var(--muted)] md:text-lg">Open a public clinical claim, attach source evidence over time, then let GenLayer resolve whether the claim is supported, contradicted, overstated, stale, or unknown.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3"><Link className="button-primary" href="/open"><Plus size={18} /> Open claim</Link><Link className="button-secondary" href="/review"><ShieldCheck size={18} /> Resolve states</Link></div>
        </div>
        <div className="mt-14 grid grid-cols-2 gap-2 text-center md:grid-cols-5">{["Claim", "Evidence", "Challenge", "Consensus", "State"].map((item, index) => <div key={item} className="border border-[var(--border-muted)] bg-[color-mix(in_srgb,var(--surface)_72%,transparent)] p-4"><p className="font-mono text-xs text-[var(--primary-muted-ink)]">{String(index + 1).padStart(2, "0")}</p><p className="label mt-2">{item}</p></div>)}</div>
      </section>
    </div>
  );
}

function DocketView({ claims, loading, refresh }: Common) {
  return <Workbench eyebrow="Public docket" title="Claim files" body="Every item is a living claim state loaded from the Intelligent Contract." action={<button className="button-secondary" onClick={refresh}><RefreshCw size={16} /> Refresh</button>}><ClaimList claims={claims} loading={loading} empty="No claims have been opened yet." /></Workbench>;
}

function OpenClaimView({ busy, getWriteClient, trackWrite }: Common) {
  const [form, setForm] = useState({ title: "Metformin diabetes prevention claim", claim: "Public claim says metformin prevents type 2 diabetes in high-risk adults based on a named trial.", context: "This dossier should compare public claim language against trial registry and corroborating source evidence." });
  async function submit() {
    await trackWrite("Open claim dossier", undefined, async () => {
      const client = await getWriteClient();
      return client.writeContract({ address: contractAddress, functionName: "open_claim", args: [form.title, form.claim, form.context], value: 0n });
    });
  }
  return <Workbench eyebrow="Claim intake" title="Open a dossier" body="A claim begins as a public file. Evidence and consensus can arrive later."><div className="grid gap-3"><Input label="Title" value={form.title} onChange={(title) => setForm({ ...form, title })} /><Textarea label="Claim text" value={form.claim} onChange={(claim) => setForm({ ...form, claim })} /><Textarea label="Public context" value={form.context} onChange={(context) => setForm({ ...form, context })} /><button className="button-primary w-fit" onClick={submit} disabled={Boolean(busy)}>{busy ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />} Open dossier</button></div></Workbench>;
}

function EvidenceRoom(props: Common) {
  const targets = props.claims.filter((claim) => claim.state === "UNREVIEWED" || claim.state === "STALE" || claim.state === "UNKNOWN");
  return <Workbench eyebrow="Evidence room" title="Attach sources" body="Add claim artifacts, official trial records, counterevidence, and context to any open dossier."><ClaimList claims={targets} loading={props.loading} empty="No claim files are ready for more evidence." action={(claim) => <EvidenceForm claim={claim} {...props} />} /></Workbench>;
}

function EvidenceForm({ claim, busy, getWriteClient, trackWrite }: Common & { claim: ClaimRecord }) {
  const [form, setForm] = useState<EvidenceForm>({ kind: "TRIAL", url: "https://clinicaltrials.gov/study/NCT00000419", contentHash: sha256Placeholder(), note: "Official trial registry evidence for this claim." });
  async function submit() {
    await trackWrite("Add evidence", claim.claim_id, async () => {
      const client = await getWriteClient();
      return client.writeContract({ address: contractAddress, functionName: "add_evidence", args: [claim.claim_id, form.kind, form.url, form.contentHash, form.note], value: 0n });
    });
  }
  return <div className="mt-4 grid gap-3 border-t border-[var(--border-muted)] pt-4"><label><span className="label">Kind</span><select className="field mt-1" value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as EvidenceForm["kind"] })}><option>CLAIM</option><option>TRIAL</option><option>COUNTER</option><option>CONTEXT</option></select></label><Input label="URL" value={form.url} onChange={(url) => setForm({ ...form, url })} /><Input label="Content hash" value={form.contentHash} onChange={(contentHash) => setForm({ ...form, contentHash })} /><Textarea label="Evidence note" value={form.note} onChange={(note) => setForm({ ...form, note })} /><button className="button-primary w-fit" onClick={submit} disabled={Boolean(busy)}>{busy ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />} Add evidence</button></div>;
}

function ConsensusView(props: Common) {
  const ready = props.claims.filter((claim) => Number(claim.evidence_count) >= 2 && (claim.state === "UNREVIEWED" || claim.state === "STALE" || claim.state === "UNKNOWN"));
  return <Workbench eyebrow="Consensus chamber" title="Resolve claim state" body="The contract fetches the evidence bundle and asks validators for one state category."><ClaimList claims={ready} loading={props.loading} empty="No dossiers have enough evidence for consensus." action={(claim) => <ConsensusActions claim={claim} {...props} />} /></Workbench>;
}

function ConsensusActions({ claim, busy, getWriteClient, trackWrite }: Common & { claim: ClaimRecord }) {
  async function resolve(fn: "resolve_claim" | "refresh_unknown", label: string) {
    await trackWrite(label, claim.claim_id, async () => {
      const client = await getWriteClient();
      return client.writeContract({ address: contractAddress, functionName: fn, args: [claim.claim_id], value: 0n });
    });
  }
  async function challenge() {
    await trackWrite("Challenge state", claim.claim_id, async () => {
      const client = await getWriteClient();
      return client.writeContract({ address: contractAddress, functionName: "challenge_state", args: [claim.claim_id, "STALE", "Request a fresh consensus pass after evidence drift."], value: 1n });
    });
  }
  return <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--border-muted)] pt-4"><button className="button-primary" onClick={() => resolve("resolve_claim", "Resolve claim")} disabled={Boolean(busy)}><ShieldCheck size={16} /> Resolve</button><button className="button-secondary" onClick={challenge} disabled={Boolean(busy)}><Plus size={16} /> Challenge</button>{claim.state === "UNKNOWN" || claim.state === "STALE" ? <button className="button-secondary" onClick={() => resolve("refresh_unknown", "Refresh unknown")} disabled={Boolean(busy)}><RefreshCw size={16} /> Refresh</button> : null}</div>;
}

function TrailView({ claims, loading, refresh }: { claims: ClaimRecord[]; loading: boolean; refresh: () => Promise<void> }) {
  return <Workbench eyebrow="My trail" title="Your opened claims" body="Address-scoped claim files for the connected wallet." action={<button className="button-secondary" onClick={refresh}><RefreshCw size={16} /> Refresh</button>}><ClaimList claims={claims} loading={loading} empty="Connect the wallet used to open claims." /></Workbench>;
}

function ClaimDetail({ claim, evidence, loading, ...props }: Common & { claim?: ClaimRecord; evidence: EvidenceRecord[] }) {
  if (loading) return <Skeleton />;
  if (!claim) return <section className="panel p-5"><h1 className="display text-3xl font-bold">Claim not found</h1></section>;
  return <section className="td-evidence-grid"><aside className="td-page-mark"><div><p className="label">{claim.claim_id}</p><h1 className="display mt-2 text-4xl font-bold leading-none">{claim.title}</h1><p className="mt-4 text-sm leading-6 text-[var(--muted)]">{claim.claim_text}</p></div><StateBadge state={claim.state} /></aside><div className="td-workbench p-5"><div className="grid border border-[var(--border-soft)] md:grid-cols-3 md:divide-x md:divide-[var(--border-soft)]"><Metric label="State" value={claim.state} /><Metric label="Evidence" value={claim.evidence_count} /><Metric label="Reviews" value={claim.review_count} /></div><div className="mt-6"><p className="label">Consensus reasoning</p><p className="mt-2 leading-7">{claim.reason || "No consensus state yet."}</p></div><div className="mt-6 grid gap-3">{evidence.map((row) => <div key={row.evidence_id} className="td-case-strip p-4"><p className="label">{row.kind} · {row.evidence_id}</p><a className="mt-2 block break-all text-[var(--primary-muted-ink)] hover:underline" href={row.url} target="_blank" rel="noreferrer">{row.url}</a><p className="mt-2 text-sm text-[var(--muted)]">{row.note}</p></div>)}</div><EvidenceForm claim={claim} loading={loading} {...props} /><ConsensusActions claim={claim} loading={loading} {...props} /></div></section>;
}

function ProfileView({ address, claims }: { address?: string; claims: ClaimRecord[] }) {
  const lower = address?.toLowerCase();
  const scoped = lower ? claims.filter((claim) => claim.opener.toLowerCase() === lower) : [];
  return <Workbench eyebrow="Profile" title={shortAddress((address ?? zeroAddress) as Address)} body={address ?? ""}><ClaimList claims={scoped} loading={false} empty="No claim files found for this address in the loaded page." /></Workbench>;
}

function Workbench({ eyebrow, title, body, action, children }: { eyebrow: string; title: string; body: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]"><aside className="td-page-mark"><div><p className="label">{eyebrow}</p><h1 className="display mt-2 text-4xl font-bold leading-none">{title}</h1><p className="mt-4 text-sm leading-6 text-[var(--muted)]">{body}</p></div>{action}</aside><div className="td-workbench"><div className="td-rule mb-5" />{children}</div></section>;
}

function ClaimList({ claims, loading, empty, action }: { claims: ClaimRecord[]; loading: boolean; empty: string; action?: (claim: ClaimRecord) => React.ReactNode }) {
  if (loading) return <Skeleton />;
  if (!claims.length) return <div className="border border-dashed border-[var(--border-soft)] bg-[var(--surface-muted)] p-6 text-[var(--muted)]">{empty}</div>;
  return <div className="grid gap-3">{claims.map((claim) => <article key={claim.claim_id} className="td-case-strip p-4"><div className="grid gap-4 md:grid-cols-[7rem_minmax(0,1fr)_auto] md:items-start"><div className="border border-[var(--border-muted)] bg-[var(--surface-soft)] p-3 font-mono text-xs font-bold text-[var(--muted)]"><span className="block text-[var(--ink)]">{claim.claim_id}</span><span>{claim.evidence_count} sources</span></div><div><Link className="text-lg font-black hover:text-[var(--primary)]" href={`/case/${claim.claim_id}`}>{claim.title}</Link><p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{claim.claim_text}</p></div><StateBadge state={claim.state} /></div>{action ? <div>{action(claim)}</div> : null}</article>)}</div>;
}

function StateBadge({ state }: { state: string }) {
  const tone = state === "SUPPORTED" ? "border-[var(--success)] bg-[var(--success-bg)] text-[var(--success)]" : state === "UNKNOWN" || state === "STALE" ? "border-[var(--warning)] bg-[var(--warning-bg)] text-[var(--warning)]" : state === "CONTRADICTED" || state === "OVERSTATED" ? "border-[var(--danger)] bg-[var(--danger-bg)] text-[var(--danger)]" : "border-[var(--border-soft)] bg-[var(--surface-muted)] text-[var(--ink)]";
  return <span className={`inline-flex w-fit justify-self-start rounded-[3px_14px_3px_14px] border px-3 py-1.5 text-xs font-black md:justify-self-end ${tone}`}>{state}</span>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="border-b border-[var(--border-muted)] p-5 last:border-b-0 md:border-b-0"><p className="label">{label}</p><p className="display mt-2 text-3xl font-black">{value}</p></div>;
}

function PendingTransactions({ txs }: { txs: TrackedTx[] }) {
  const active = txs.filter((tx) => !["ACCEPTED", "FINALIZED", "CANCELED"].includes(tx.status));
  if (!active.length) return null;
  return <section className="td-command mb-5 overflow-hidden"><div className="divide-y divide-[var(--border-muted)]">{active.slice(0, 3).map((tx) => <div key={tx.hash} className="flex items-center justify-between px-5 py-3"><div><p className="font-bold">{tx.label}</p><p className="text-sm text-[var(--muted)]">{tx.status} · {formatUtc(tx.submittedAt)}</p></div><a className="button-secondary" href={`${explorerBase}/tx/${tx.hash}`} target="_blank" rel="noreferrer" aria-label="Open transaction"><ExternalLink size={16} /></a></div>)}</div></section>;
}

function ErrorBox({ message }: { message: string }) {
  return <div className="mb-4 flex items-start gap-3 border border-[var(--danger)] bg-[var(--danger-bg)] p-4" role="alert"><AlertTriangle size={20} /><p>{message}</p></div>;
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label><span className="label">{label}</span><input className="field mt-1" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Textarea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label><span className="label">{label}</span><textarea className="field mt-1 min-h-28" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Skeleton() {
  return <div className="grid gap-3"><div className="h-24 animate-pulse bg-[var(--border-muted)]" /><div className="h-24 animate-pulse bg-[var(--border-muted)]" /></div>;
}

function readableError(err: unknown) {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes("[EXPECTED]") || raw.includes("EXPECTED:")) return raw.replace("[EXPECTED]", "").replace("EXPECTED:", "").trim();
  if (raw.includes("[TRANSIENT]")) return "The external source was temporarily unavailable. Retry after a short wait.";
  if (raw.includes("[LLM_ERROR]")) return "The model returned unusable output. Retry the consensus transaction.";
  return raw;
}

declare global {
  interface Window {
    ethereum?: { request(args: { method: string; params?: unknown[] }): Promise<unknown> };
  }
}
