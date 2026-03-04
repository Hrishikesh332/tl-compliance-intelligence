import { Link } from 'react-router-dom'
import logoMarkUrl from '../../strand/assets/logo-mark.svg?url'
/* Strand UI: icons from design system */
import searchIconUrl from '../../strand/icons/search.svg?url'
import embedIconUrl from '../../strand/icons/embed.svg?url'
import generateIconUrl from '../../strand/icons/generate.svg?url'
import entityIconUrl from '../../strand/icons/entity.svg?url'
import visionIconUrl from '../../strand/icons/vision.svg?url'
import analyzeIconUrl from '../../strand/icons/analyze.svg?url'
import hourglassIconUrl from '../../strand/icons/hourglass.svg?url'
import warningIconUrl from '../../strand/icons/warning.svg?url'
import profileIconUrl from '../../strand/icons/profile.svg?url'

function IconArrowRight({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  )
}

/* ── Data ──────────────────────────────────────────────────────────────── */

const problems = [
  {
    iconUrl: hourglassIconUrl,
    title: 'Manual Review is Slow & Costly',
    desc: 'Compliance teams spend hundreds of hours manually scrubbing through bodycam, dashcam, and CCTV footage to identify violations, missing critical issues due to fatigue and human error.',
  },
  {
    iconUrl: warningIconUrl,
    title: 'Violations Slip Through the Cracks',
    desc: 'Without automated detection, safety hazards, missing PPE, blocked emergency exits, and procedural violations go unnoticed until an incident occurs or an audit flags them.',
  },
  {
    iconUrl: profileIconUrl,
    title: 'Person Tracking is Nearly Impossible',
    desc: 'Identifying when and where a specific individual appears across dozens of video feeds requires frame-by-frame inspection — an impractical task at scale.',
  },
]

const features = [
  {
    iconUrl: embedIconUrl,
    color: 'bg-[var(--strand-product-embed-light)]',
    title: 'Video Indexing & Embedding',
    desc: 'Upload video assets and generate multimodal embeddings (visual + audio) using TwelveLabs Marengo for semantic search.',
  },
  {
    iconUrl: searchIconUrl,
    color: 'bg-[var(--strand-product-search-light)]',
    title: 'Natural Language Search',
    desc: 'Search inside videos with plain English and get timestamped results ranked by relevance.',
  },
  {
    iconUrl: entityIconUrl,
    color: 'bg-[var(--strand-ui-accent-light)]',
    title: 'Face-Based Entity Matching',
    desc: 'Register a face as an entity and find every video and clip where that person appears.',
  },
  {
    iconUrl: generateIconUrl,
    color: 'bg-[var(--strand-product-generate-light)]',
    title: 'Automated Video Analysis',
    desc: 'Per-video reports: risk level, categories, detected objects, transcript — via TwelveLabs Pegasus.',
  },
  {
    iconUrl: visionIconUrl,
    color: 'bg-[var(--strand-product-search-light)]',
    title: 'Conversational Video Q&A',
    desc: 'Ask questions about any video; get answers with clickable timestamps to the relevant moment.',
  },
  {
    iconUrl: analyzeIconUrl,
    color: 'bg-red-50',
    title: 'Risk & Compliance Insights',
    desc: 'Surface safety hazards, violations, and risk scores; people, objects, and transcript in one dashboard.',
  },
]

const howItHelps = [
  { title: 'Compliance Officers', desc: 'Instantly flag violations and generate audit-ready PDF reports with timestamped evidence.' },
  { title: 'Security Teams', desc: 'Track persons of interest across multiple camera feeds with face-based entity search.' },
  { title: 'Safety Managers', desc: 'Detect missing PPE, blocked exits, and hazard signs — automatically — across all footage.' },
  { title: 'Legal & Insurance', desc: 'Quickly locate relevant clips for claims, investigations, and dispute resolution.' },
]

/* ── Page ──────────────────────────────────────────────────────────────── */

export default function OverviewPage() {
  return (
    <div className="w-full">

      {/* ─── Concise header ──────────────────────────────────────────── */}
      <section className="border-b border-border bg-surface">
        <div className="max-w-[1200px] mx-auto px-5 sm:px-8 py-6 sm:py-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="font-brand text-h4 sm:text-h3 font-medium text-text-primary tracking-tight">
                Multi-Source Legal Evidence Investigator
              </h1>
              <p className="mt-1 text-sm text-text-secondary">
                Automate video compliance review — search, track individuals, and generate audit-ready reports.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <a
                href="#demo-video"
                className="inline-flex items-center gap-2 h-10 px-5 rounded-xl border border-border text-text-primary font-semibold text-sm hover:bg-card transition-colors"
              >
                Watch Demo
              </a>
              <a
                href="https://www.twelvelabs.io/developers"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 h-10 px-5 rounded-xl border border-border text-text-primary font-semibold text-sm hover:bg-card transition-colors"
              >
                View Code
              </a>
              <a
                href="https://www.twelvelabs.io/contact"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 h-10 px-5 rounded-xl border border-border text-text-primary font-semibold text-sm hover:bg-card transition-colors"
              >
                Talk to Sales
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ─── The Problem ─────────────────────────────────────────────── */}
      <section className="bg-background">
        <div className="max-w-[1200px] mx-auto px-5 sm:px-8 py-14 sm:py-20">
          <div className="text-center mb-10 sm:mb-14">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-red-50 text-red-600 mb-3">
              The Problem
            </span>
            <h2 className="font-brand text-h4 sm:text-h3 font-medium text-text-primary">
              Video Compliance Review is Broken
            </h2>
            <p className="mt-3 text-text-secondary max-w-2xl mx-auto">
              Organizations manage thousands of hours of surveillance, bodycam, and operational footage.
              Reviewing it manually is expensive, error-prone, and doesn't scale.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-5 sm:gap-6">
            {problems.map((p, i) => (
              <div
                key={i}
                className="rounded-xl border border-border bg-surface p-6 sm:p-7 hover:shadow-md transition-shadow"
              >
                <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center mb-3">
                  <img src={p.iconUrl} alt="" className="w-4 h-4" aria-hidden />
                </div>
                <h3 className="font-semibold text-text-primary text-sm mb-1.5">{p.title}</h3>
                <p className="text-sm text-text-secondary leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Features ────────────────────────────────────────────────── */}
      <section className="bg-surface border-t border-border">
        <div className="max-w-[1200px] mx-auto px-5 sm:px-8 py-8 sm:py-10">
          <div className="text-center mb-6 sm:mb-8">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-[var(--strand-ui-accent-light)] text-[var(--strand-ui-accent-hover)] mb-2">
              Features
            </span>
            <h2 className="font-brand text-h5 sm:text-h4 font-medium text-text-primary">
              Everything You Need for Video Compliance
            </h2>
            <p className="mt-2 text-sm text-text-secondary max-w-xl mx-auto">
              AI-powered tools on TwelveLabs to automate video compliance workflows.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {features.map((f, i) => (
              <div
                key={i}
                className="group rounded-xl border border-border bg-background p-4 hover:border-gray-400 hover:shadow-sm transition-all"
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${f.color}`}>
                  <img src={f.iconUrl} alt="" className="w-4 h-4" aria-hidden />
                </div>
                <h3 className="font-semibold text-text-primary text-sm mb-1">{f.title}</h3>
                <p className="text-xs text-text-secondary leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Architecture Diagram ────────────────────────────────────── */}
      <section className="bg-background border-t border-border">
        <div className="max-w-[1200px] mx-auto px-5 sm:px-8 py-14 sm:py-20">
          <div className="text-center mb-8 sm:mb-10">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-[var(--strand-product-embed-light)] text-[var(--strand-product-embed-dark)] mb-3">
              Architecture
            </span>
            <h2 className="font-brand text-h4 sm:text-h3 font-medium text-text-primary">
              System Architecture
            </h2>
            <p className="mt-3 text-text-secondary max-w-xl mx-auto">
              End-to-end pipeline from video upload through multimodal indexing, semantic search,
              and compliance analysis.
            </p>
          </div>
          <div className="rounded-2xl border-2 border-dashed border-gray-300 bg-surface flex flex-col items-center justify-center min-h-[320px] sm:min-h-[400px] p-8">
            <div className="w-14 h-14 rounded-xl bg-card flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-text-tertiary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18M9 21V9" />
              </svg>
            </div>
            <p className="text-text-secondary font-medium text-sm">Architecture Diagram</p>
            <p className="text-text-tertiary text-xs mt-1.5 max-w-xs text-center">
              Drop your architecture diagram image here or replace this placeholder with an
              &lt;img&gt; tag pointing to your diagram asset.
            </p>
          </div>
        </div>
      </section>

      {/* ─── Demo Video ──────────────────────────────────────────────── */}
      <section id="demo-video" className="bg-surface border-t border-border">
        <div className="max-w-[1200px] mx-auto px-5 sm:px-8 py-14 sm:py-20">
          <div className="text-center mb-8 sm:mb-10">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-[var(--strand-product-generate-light)] text-[var(--strand-product-generate-dark)] mb-3">
              Demo
            </span>
            <h2 className="font-brand text-h4 sm:text-h3 font-medium text-text-primary">
              See It in Action
            </h2>
            <p className="mt-3 text-text-secondary max-w-xl mx-auto">
              Watch how Compliance Intelligence processes a video from upload to full analysis
              in under two minutes.
            </p>
          </div>
          <div className="rounded-2xl border-2 border-dashed border-gray-300 bg-brand-charcoal flex flex-col items-center justify-center aspect-video max-w-4xl mx-auto overflow-hidden relative">
            <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center mb-4 border border-white/20">
              <svg className="w-7 h-7 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </div>
            <p className="text-white/60 font-medium text-sm">Demo Video</p>
            <p className="text-white/40 text-xs mt-1.5 max-w-xs text-center">
              Replace this placeholder with a &lt;video&gt; element or an iframe embed
              pointing to your demo recording.
            </p>
          </div>
        </div>
      </section>

      {/* ─── How This App Helps ──────────────────────────────────────── */}
      <section className="bg-background border-t border-border">
        <div className="max-w-[1200px] mx-auto px-5 sm:px-8 py-14 sm:py-20">
          <div className="text-center mb-10 sm:mb-14">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-[var(--strand-ui-accent-light)] text-[var(--strand-ui-accent-hover)] mb-3">
              Impact
            </span>
            <h2 className="font-brand text-h4 sm:text-h3 font-medium text-text-primary">
              Who Benefits & How
            </h2>
            <p className="mt-3 text-text-secondary max-w-2xl mx-auto">
              Designed for teams that work with video evidence daily — from compliance audits
              to security investigations.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-5 sm:gap-6 max-w-3xl mx-auto">
            {howItHelps.map((h, i) => (
              <div
                key={i}
                className="flex gap-4 rounded-xl border border-border bg-surface p-5 sm:p-6 hover:shadow-md transition-shadow"
              >
                <div className="w-10 h-10 rounded-lg bg-[var(--strand-ui-accent-light)] text-[var(--strand-ui-accent-hover)] flex items-center justify-center shrink-0">
                  <span className="font-brand text-lg font-semibold">{i + 1}</span>
                </div>
                <div>
                  <h3 className="font-semibold text-text-primary text-sm mb-1">{h.title}</h3>
                  <p className="text-sm text-text-secondary leading-relaxed">{h.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Powered by TwelveLabs ───────────────────────────────────── */}
      <section className="border-t border-border bg-surface">
        <div className="max-w-[1200px] mx-auto px-5 sm:px-8 py-14 sm:py-20">
          <div className="flex flex-col lg:flex-row items-center gap-8 lg:gap-16">
            <div className="flex-1 text-center lg:text-left">
              <div className="inline-flex items-center gap-2.5 mb-5">
                <img src={logoMarkUrl} alt="" className="h-8 w-auto" />
                <span className="font-brand text-h5 font-semibold text-text-primary">TwelveLabs</span>
              </div>
              <h2 className="font-brand text-h4 sm:text-h3 font-medium text-text-primary leading-tight">
                Built on Multimodal Video Understanding
              </h2>
              <p className="mt-4 text-text-secondary max-w-lg leading-relaxed">
                This application leverages the TwelveLabs platform for state-of-the-art
                video intelligence — from Marengo embeddings for semantic search and face matching
                to Pegasus for generative video analysis and transcription.
              </p>
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 mt-6 h-11 px-6 rounded-xl bg-[var(--strand-ui-accent)] text-brand-charcoal font-semibold text-sm hover:bg-[var(--strand-ui-accent-hover)] transition-colors"
              >
                Explore the Dashboard
                <IconArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="flex-1 w-full max-w-md">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Marengo Embed', tag: 'Embed', color: 'bg-[var(--strand-product-embed-light)] border-[var(--strand-product-embed)]/30', text: 'text-[var(--strand-product-embed-dark)]', desc: 'Multimodal embeddings for visual + audio search' },
                  { label: 'Pegasus Generate', tag: 'Generate', color: 'bg-[var(--strand-product-generate-light)] border-[var(--strand-product-generate)]/30', text: 'text-[var(--strand-product-generate-dark)]', desc: 'AI summaries, transcripts, risk analysis' },
                  { label: 'Semantic Search', tag: 'Search', color: 'bg-[var(--strand-product-search-light)] border-[var(--strand-product-search)]/30', text: 'text-[var(--strand-product-search-dark)]', desc: 'Natural language video search' },
                  { label: 'Face Matching', tag: 'Entity', color: 'bg-[var(--strand-ui-accent-light)] border-[var(--strand-ui-accent)]/30', text: 'text-[var(--strand-ui-accent-hover)]', desc: 'Person tracking via face embeddings' },
                ].map((c, i) => (
                  <div key={i} className={`rounded-xl border p-4 ${c.color}`}>
                    <span className={`text-xs font-semibold uppercase tracking-wider ${c.text}`}>{c.tag}</span>
                    <p className="text-sm font-medium text-text-primary mt-1.5">{c.label}</p>
                    <p className="text-xs text-text-secondary mt-1 leading-snug">{c.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Footer CTA ──────────────────────────────────────────────── */}
      <section className="bg-surface border-t border-border">
        <div className="max-w-[1200px] mx-auto px-5 sm:px-8 py-10 sm:py-14 text-center">
          <h2 className="font-brand text-h5 sm:text-h4 font-medium text-text-primary">
            Ready to Get Started with Multi-Source Legal Evidence Investigator?
          </h2>
          <p className="mt-2 text-text-secondary max-w-lg mx-auto text-sm">
            Upload your first video and see results in seconds.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <a
              href="https://www.twelvelabs.io/developers"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 h-11 px-6 rounded-xl bg-brand-charcoal text-brand-white font-semibold text-sm hover:bg-gray-600 transition-colors"
            >
              View Code
            </a>
            <a
              href="https://www.twelvelabs.io/contact"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 h-11 px-6 rounded-xl border border-border text-text-primary font-semibold text-sm hover:bg-card transition-colors"
            >
              Talk to Sales
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}
