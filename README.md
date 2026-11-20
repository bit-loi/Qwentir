<div align="center">
  <img src="https://github.com/QwenLM.png" alt="Qwen" width="96" height="96" style="border-radius:18px;" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://commons.wikimedia.org/wiki/Special:FilePath/Alibaba_Cloud_Logo.png" alt="Alibaba Cloud" height="96" />

  <h1>Qwentir</h1>
  <p><b>AI back-office for fuel transporters.</b></p>
  <p>Three autonomous business agents — Intake, Reconciliation, Billing — that run a one-person<br/>fuel-transport company's paperwork, while the founder just watches and approves.</p>

  <p>
    <img alt="Track C — Professional Services" src="https://img.shields.io/badge/Track_C-Professional_Services-615CED?style=for-the-badge" />
    <img alt="Qwen Mini Hackathon 2026" src="https://img.shields.io/badge/Qwen_Mini_Hackathon-2026-FF6A00?style=for-the-badge" />
    <img alt="Built with Qoder" src="https://img.shields.io/badge/Built_with-Qoder-00C4B4?style=for-the-badge" />
    <img alt="Node.js" src="https://img.shields.io/badge/Node.js-Runtime-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" />
  </p>
</div>

---

## The problem

A small tank-truck company (a *transportir*) hauls fuel for a big client such as Pertamina Patra Niaga. The hard part is not on the road — **it is on paper**. Every single shipment produces a stack of documents: a delivery order (DO), a loading record, a discharge record, and then an invoice.

One admin can drown in hundreds of documents, and a single missed volume discrepancy becomes real money lost or an invoice rejected by the client.

**Qwentir replaces that admin desk with three AI "employees" that hand work to each other automatically — no manual clicking.** The founder only monitors a Virtual Office and presses **approve**, **pause**, or **stop**.

> One founder. Three agents. A business that runs itself.

## What Qwentir does

| Stage | Agent | Input | Output |
|---|---|---|---|
| 1 | **Intake** | Client DO (PDF/email) + driver's loading/discharge records (photo / WhatsApp / PDF) | Clean structured records: DO no., product, origin, destination, loaded volume, discharged volume |
| 2 | **Reconciliation** | Structured records + contract tolerance | Loss (L & %) vs. tolerance → status **OK** or **Over tolerance**, plus a discrepancy report |
| 3 | **Billing** | Reconciled records + contract tariff & penalty rules | Invoice per shipment, receivables recap per client → **Approve** to release |

The three agents run as a pipeline: Intake passes clean rows to Reconciliation, which passes reconciled rows to Billing. Problem cases are caught and flagged along the way instead of silently producing a wrong invoice.

### 1. Intake Agent
Reads messy, real-world documents and turns them into tidy table rows. It normalizes product names (aliases like `PTL`, `RON 90` → *Pertalite*), and **flags empty fields, duplicate DOs, and wrong formats** — it never guesses a missing field from a POD that merely *looks* complete.

### 2. Reconciliation Agent
Computes loaded-vs-discharged loss in liters and percent, compares it against the contract tolerance (**0.5%**), and outputs `OK` or `Over tolerance`. It also catches **orphan PODs** (no matching DO), **duplicate PODs**, and **PODs overdue** beyond the 3-day limit.

### 3. Billing Agent
Builds the invoice from the contract tariff, subtracts penalties where applicable, and produces a **receivables recap per client**. The invoice is billed to the client (e.g. Pertamina Patra Niaga) and waits for the founder's **Approve** before it is released.

## A shipment, end to end

> Numbers below follow the contract rules bundled in [`data/contracts.json`](data/contracts.json): tariff **Rp 500/L**, shrinkage tolerance **0.5%**, penalty = *excess liters × product price/L*.

```
DO-001 · Pertalite · Plumpang  →  SPBU Kebon Jeruk
Loaded 10,000 L   |   Discharged 9,900 L
```

1. **Intake** → one clean row: `DO-001, Pertalite, Plumpang, SPBU Kebon Jeruk, 10000, 9900`.
2. **Reconciliation** → loss `100 L (1.0%)`. Allowed loss = `0.5% × 10,000 = 50 L`, so this is **Over tolerance** → flagged suspicious. Excess = `100 − 50 = 50 L`.
3. **Billing** →
   - Transport revenue: `9,900 L × Rp 500 = Rp 4,950,000`
   - Penalty: `50 L × Rp 10,000 (Pertalite) = −Rp 500,000`
   - **Invoice: Rp 4,450,000** → **Approve** button lights up in the Virtual Office.

## Virtual Office UI

An 8-bit office — styled after Soul Knight / ChillyRoom pixel rooms (dark surround, spotlight pool, vignette, chibi big-head sprites, chunky desks with glowing monitors, neon signage, office cat) — where the founder watches — and talks to — their real QoderWake Wakers. Run it locally:

```bash
npm run start:office       # or: node office/server.js  → http://localhost:8787
npm test                   # bridge test suite (node:test, zero credits consumed)
```

- **Live office map** — pixel-art canvas; every Waker becomes an employee wandering between desk, coffee machine, and meeting table. While a session turn is running they sit at their desk typing with a "…" bubble and a glowing monitor.
- **Click an employee → chat & assign tasks** — the drawer opens a real QoderWake session (`session create / send / events` through the local daemon CLI), bound to this repo as cwd so the Waker reads `data/`, `agents/`, and `output/` directly. Quick-task buttons per role seed typical Qwentir jobs (intake validation, reconciliation sweeps, invoice drafts).
- **File attachments** — the `FILE+` button in the chat drawer uploads DO/POD files (or anything ≤ 20 MB) into `inbox/` (gitignored) and appends their repo paths to the task message, so the Waker opens them straight from disk.
- **Roster & hiring** — the bottom strip maps Wakers to Qwentir roles (Intake / Reconciliation / Billing) by description keywords. An unfilled desk shows `VACANT`; **HIRE** creates a new Waker in your QoderWake (`waker create`) from the role persona under `agents/`.
- **HUD** — daemon online/offline, running session count, repo path, plus Qwen & Alibaba Cloud marks (also painted as wall posters inside the office).

The bridge (`office/server.js`) is a zero-dependency Node HTTP server that proxies the local QoderWake daemon via the `qoderwake` CLI; the frontend (`office/public/`) is vanilla-JS canvas — no build step, no new npm dependencies. `office/test.js` covers static serving, path-traversal guard, roles payload, upload round-trip, and input validation without ever creating an agent session.

## Repository layout

```
agents/     Identity, persona, and "bible" (operating rules) for each of the 3 agents
office/     Virtual Office UI — 8-bit office wired to the local QoderWake daemon
  server.js         Zero-dep bridge: static files + /api/* → qoderwake CLI
  roles.json        Qwentir role ↔ Waker mapping, quick tasks, hire package
  public/           Canvas office sim (index.html, office.js, sprites.js, style.css)
data/       Seed data + contract terms used by the pipeline
  contracts.json    Tariff, 0.5% shrinkage tolerance, penalty rules, 3-day POD overdue limit
  orders/           Delivery-order text files
  pods/             Proof-of-delivery text files (driver WhatsApp / discharge notes)
  answer_key.csv    Ground truth for the dummy dataset — NOT read by the agents
output/     Generated field documents (DO & POD, PDF/JPG) + admin recap + answer key
scripts/    Deterministic dummy-data generator
  generate-dataset.js   One-command orchestrator (text + documents)
  lib/{rng,data,svg,render,textdata}.js
  inspect-pdf.mjs       Dev helper to rasterize generated PDFs (mupdf)
assets/fonts/           Bundled handwriting/UI fonts (OFL: Caveat, Patrick Hand, Kalam, PT Sans)
```

## Dummy data generator

To demo the agents honestly, Qwentir ships with a **deterministic generator** that produces a realistic, deliberately-dirty back-office dataset: delivery orders and proof-of-delivery documents as text and as degraded field documents (skewed photos, handwriting, scan noise, WhatsApp compression). It includes duplicate DOs, orphan/duplicate PODs, mixed units (`KL` / `ltr`), typos, and over-tolerance losses — with an `answer_key.csv` ground truth the agents never see.

```bash
npm install
node scripts/generate-dataset.js
```

The run is fully reproducible: a fixed seed (`20261118`) guarantees byte-identical output across runs, and no external API is called at generation time.

## Tech stack

- **Runtime:** Node.js
- **Documents & images:** `pdfkit` (PDF), `@resvg/resvg-js` (SVG → PNG), `sharp` (image degradation), `mupdf` (PDF inspection, dev)
- **Agents:** prompt-driven business agents defined under `agents/` (identity + persona + operating bible)
- **Models / platform:** Qwen (Alibaba Cloud), built with Qoder

## Roadmap

- [x] Dummy dataset: ~50 DOs + PODs, intentionally dirty
- [ ] Intake Agent — end-to-end
- [ ] Reconciliation Agent
- [ ] Billing Agent — 3 agents auto-handoff
- [x] Virtual Office UI (8-bit office, chat & task assignment via QoderWake daemon)
- [ ] Large-batch test (real output, credits consumed)
- [ ] Demo video (≤ 5 min)

## Hackathon context

Built for the **Qwen Mini Hackathon 2026** — **Track C: Professional Services**.
Format: a Virtual Office UI plus at least 3 cooperating business agents that work autonomously.

## Disclaimer

All company names, people, SPBU/depot names, plate numbers, and figures in this project are **fictional** and for demonstration only. Real companies (e.g. PT Pertamina Patra Niaga, PT Timbul Cahaya Energi, PT Elnusa Petrofin, Patra Logistik) are referenced only as *examples of the type of company* Qwentir serves — **not** as a claim that they use Qwentir.

<div align="center">
  <sub>Powered by Qwen · Alibaba Cloud</sub>
</div>
