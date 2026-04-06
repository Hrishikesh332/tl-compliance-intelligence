import { Link } from 'react-router-dom'
import logoMarkUrl from '../../strand/assets/logo-mark.svg?url'
import searchIconUrl from '../../strand/icons/search.svg?url'
import embedIconUrl from '../../strand/icons/embed.svg?url'
import generateIconUrl from '../../strand/icons/generate.svg?url'
import entityIconUrl from '../../strand/icons/entity.svg?url'
import visionIconUrl from '../../strand/icons/vision.svg?url'
import analyzeIconUrl from '../../strand/icons/analyze.svg?url'
import hourglassIconUrl from '../../strand/icons/hourglass.svg?url'
import warningIconUrl from '../../strand/icons/warning.svg?url'
import profileIconUrl from '../../strand/icons/profile.svg?url'
import workflowDiagramUrl from '../architecture/workflow.png'

function IconArrowRight({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  )
}
const problems = [
  {
    iconUrl: warningIconUrl,
    title: 'Fragmented Video Evidence',
    desc: 'Lawyers and investigators receive video evidence from multiple sources in different formats and qualities, making unified analysis nearly impossible with traditional tools.',
  },
  {
    iconUrl: hourglassIconUrl,
    title: 'Evidence Review Is a Cost Sink',
    desc: 'Manually reviewing hours of footage to find relevant moments or track a subject across sources costs law firms $200–500/hour in paralegal time, turning a single case into a 40+ hour evidence review marathon.',
  },
  {
    iconUrl: searchIconUrl,
    title: 'Video Can’t Be Keyword- Searched',
    desc: 'Unlike documents that can be keyword-searched, video evidence requires understanding visual content, motion patterns, and temporal relationships across disparate sources — capabilities that traditional eDiscovery platforms lack.',
  },
  {
    iconUrl: profileIconUrl,
    title: 'Fatigue Risks Missing Critical Moments',
    desc: 'Critical evidence moments get missed when investigators are fatigued from reviewing hours of irrelevant footage, potentially compromising case outcomes.',
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

const useCases = [
  {
    title: 'Traffic Accident Reconstruction',
    desc: 'Find a specific vehicle across multiple city cameras, dashcams, and doorbell footage to establish a complete timeline of movements before and after an incident.',
  },
  {
    title: 'Workplace Incident Investigation',
    desc: 'Track a person’s movements through facility cameras to document the sequence of events, verify witness statements, and surface potential safety violations.',
  },
  {
    title: 'Criminal Defense Alibi Verification',
    desc: 'Locate evidence of a client’s whereabouts across public cameras, business surveillance, and personal recordings to build a defensible timeline.',
  },
  {
    title: 'Insurance Claims Investigation',
    desc: 'Cross-reference claimant statements with video from multiple sources to verify incident details and detect potential fraud indicators.',
  },
]
export default function OverviewPage() {
  return (
    <div className="w-full">

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
                href="https://github.com/Hrishikesh332/tl-compliance-intelligence"
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

      <section className="bg-background">
        <div className="max-w-[1200px] mx-auto px-5 sm:px-8 py-14 sm:py-20">
          <div className="text-center mb-10 sm:mb-14">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-red-50 text-red-600 mb-3">
              The Problem
            </span>
            <h2 className="font-brand text-h4 sm:text-h3 font-medium text-text-primary">
              Legal Video Evidence Review is Broken
            </h2>
            <p className="mt-3 text-text-secondary max-w-2xl mx-auto">
              Lawyers and investigators juggle hours of bodycam, CCTV, and mobile footage across formats.
              Traditional tools make it slow, expensive, and easy to miss critical moments.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-5 sm:gap-6">
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
            <img
              src={workflowDiagramUrl}
              alt="System workflow architecture"
              className="w-full h-auto rounded-xl border border-border bg-white object-contain"
            />
          </div>
        </div>
      </section>

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
          <div className="max-w-4xl mx-auto">
            <div className="rounded-2xl border border-border bg-brand-charcoal aspect-video overflow-hidden relative">
              <iframe
                className="absolute inset-0 w-full h-full"
                src="https://www.youtube-nocookie.com/embed/W9W6vE-tSIQ"
                title="Demo: See it in action"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
            <div className="mt-3 text-center">
              <a
                href="https://youtu.be/W9W6vE-tSIQ"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-semibold text-text-primary hover:underline"
              >
                Open on YouTube
                <IconArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-surface border-t border-border">
        <div className="max-w-[1200px] mx-auto px-5 sm:px-8 py-14 sm:py-20">
          <div className="text-center mb-10 sm:mb-14">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-[var(--strand-product-search-light)] text-[var(--strand-product-search-dark)] mb-3">
              Use Cases
            </span>
            <h2 className="font-brand text-h4 sm:text-h3 font-medium text-text-primary">
              Where Multi-Source Video Matters Most
            </h2>
            <p className="mt-3 text-text-secondary max-w-2xl mx-auto">
              Built for high-stakes investigations where every second of footage contributes to the story:
              traffic, workplace, criminal, and insurance cases.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-5 sm:gap-6 max-w-3xl mx-auto">
            {useCases.map((u, i) => (
              <div
                key={u.title}
                className="group rounded-xl border border-border bg-background p-5 sm:p-6 hover:border-gray-400 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h3 className="font-semibold text-text-primary text-sm sm:text-base">
                    {u.title}
                  </h3>
                  <div className="w-9 h-9 rounded-lg bg-[var(--strand-ui-accent-light)] text-[var(--strand-ui-accent-hover)] flex items-center justify-center shrink-0">
                    <svg
                      className="w-5 h-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.8}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <rect x="3" y="5" width="12" height="10" rx="1.5" />
                      <path d="M11 9.5 9.5 8.5 8 7.5v5l1.5-1 1.5-1" />
                      <circle cx="17" cy="9" r="2.25" />
                      <path d="M18.8 15.5 17 13.5l-1.2 1.3" />
                    </svg>
                  </div>
                </div>
                <p className="text-sm text-text-secondary leading-relaxed">
                  {u.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

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
                TwelveLabs Marengo and Pegasus models are invoked via <strong className="text-text-primary">AWS Bedrock Runtime</strong>,
                with video assets stored in S3, vector embeddings indexed for cosine-similarity search,
                and AI-detected objects with timestamps (Pegasus + frame thumbnails).
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
                  { label: 'Pegasus Analyze', tag: 'Analyze', color: 'bg-[var(--strand-product-generate-light)] border-[var(--strand-product-generate)]/30', text: 'text-[var(--strand-product-generate-dark)]', desc: 'AI summaries, transcripts, risk analysis' },
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
              <div className="mt-4 rounded-xl border border-gray-200 bg-[#f9fafb] p-4">
                <div className="flex items-center justify-center mb-3" aria-label="AWS">
                  <svg className="w-8 h-8 shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 333334 199332" shapeRendering="geometricPrecision" textRendering="geometricPrecision" imageRendering="optimizeQuality" fillRule="evenodd" clipRule="evenodd" aria-hidden>
                    <defs>
                      <style>{'.aws-fil1{fill:#f90}'}</style>
                    </defs>
                    <g>
                      <path d="M93937 72393c0 4102 443 7428 1219 9867 887 2439 1996 5100 3548 7982 554 887 776 1774 776 2550 0 1109-665 2217-2106 3326l-6985 4656c-998 665-1995 998-2882 998-1109 0-2217-554-3326-1552-1552-1663-2882-3437-3991-5211-1109-1885-2217-3991-3437-6541-8648 10200-19512 15299-32594 15299-9312 0-16740-2661-22172-7982-5432-5322-8204-12417-8204-21286 0-9424 3326-17073 10089-22838s15743-8647 27161-8647c3769 0 7650 332 11752 887 4102 554 8315 1441 12749 2439v-8093c0-8426-1774-14301-5211-17738-3548-3437-9534-5100-18071-5100-3880 0-7871 443-11973 1441s-8093 2217-11973 3769c-1774 776-3104 1219-3880 1441s-1330 332-1774 332c-1552 0-2328-1109-2328-3437v-5432c0-1774 222-3104 776-3880s1552-1552 3104-2328c3880-1996 8537-3659 13969-4989C43606 885 49370 220 55468 220c13193 0 22838 2993 29046 8980 6098 5987 9202 15077 9202 27272v35920h222zM48926 89244c3659 0 7428-665 11419-1995s7539-3769 10532-7095c1774-2106 3104-4435 3770-7095 665-2661 1108-5876 1108-9645v-4656c-3215-776-6652-1441-10199-1885-3548-443-6984-665-10421-665-7428 0-12860 1441-16519 4435-3659 2993-5432 7206-5432 12749 0 5211 1330 9091 4102 11751 2661 2772 6541 4102 11641 4102zm89023 11973c-1996 0-3326-332-4213-1109-887-665-1663-2217-2328-4324l-26053-85697c-665-2217-998-3658-998-4434 0-1774 887-2772 2661-2772h10865c2106 0 3548 333 4324 1109 887 665 1552 2217 2217 4324l18625 73391 17295-73391c554-2217 1219-3659 2106-4324s2439-1109 4435-1109h8869c2106 0 3548 333 4435 1109 887 665 1663 2217 2106 4324l17516 74278 19180-74278c665-2217 1441-3659 2217-4324 887-665 2328-1109 4324-1109h10310c1774 0 2772 887 2772 2772 0 554-111 1109-222 1774s-333 1552-776 2772l-26718 85697c-665 2217-1441 3658-2328 4324-887 665-2328 1109-4213 1109h-9534c-2107 0-3548-333-4435-1109s-1663-2217-2106-4435l-17184-71507-17073 71396c-554 2217-1220 3658-2107 4434s-2439 1109-4434 1109h-9534zm142459 2993c-5765 0-11530-665-17073-1995s-9867-2772-12749-4435c-1774-998-2993-2106-3437-3104-443-998-665-2106-665-3104v-5654c0-2328 887-3437 2550-3437 665 0 1330 111 1995 333s1663 665 2772 1109c3769 1663 7871 2993 12195 3880 4435 887 8758 1330 13193 1330 6984 0 12417-1220 16186-3659s5765-5987 5765-10532c0-3104-998-5654-2993-7760-1996-2107-5765-3991-11197-5765l-16075-4989c-8093-2550-14080-6319-17738-11308-3658-4878-5543-10310-5543-16075 0-4656 998-8758 2993-12306s4656-6652 7982-9091c3326-2550 7095-4434 11530-5765S279190-2 284068-2c2439 0 4989 111 7428 443 2550 333 4878 776 7206 1219 2217 554 4324 1109 6319 1774s3548 1330 4656 1996c1552 887 2661 1774 3326 2771 665 887 998 2107 998 3659v5211c0 2328-887 3548-2550 3548-887 0-2328-444-4213-1331-6319-2882-13415-4324-21286-4324-6319 0-11308 998-14745 3104s-5211 5321-5211 9867c0 3104 1109 5765 3326 7871s6319 4213 12195 6097l15743 4989c7982 2550 13747 6098 17184 10643s5100 9756 5100 15521c0 4767-998 9091-2882 12860-1996 3770-4656 7095-8093 9756-3437 2771-7539 4767-12306 6208-4989 1552-10199 2328-15854 2328z" fill="#252f3e"/>
                      <path className="aws-fil1" d="M301362 158091c-36474 26940-89467 41241-135031 41241-63858 0-121395-23614-164854-62859-3437-3104-332-7317 3770-4878 47006 27272 104988 43791 164964 43791 40465 0 84921-8426 125830-25721 6097-2772 11308 3991 5321 8426z"/>
                      <path className="aws-fil1" d="M316550 140796c-4656-5987-30820-2883-42682-1441-3548 443-4102-2661-887-4989 20842-14634 55099-10421 59090-5543 3991 4989-1109 39246-20620 55653-2993 2550-5876 1220-4545-2106 4435-10976 14301-35698 9645-41574z"/>
                    </g>
                  </svg>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { name: 'Bedrock Runtime', desc: 'Marengo & Pegasus model runtime' },
                    { name: 'S3 + Vector Index', desc: 'Video storage & embedding search' },
                    { name: 'FFmpeg', desc: 'Frame extraction for thumbnails & faces' },
                  ].map((svc) => (
                    <div key={svc.name} className="text-center px-2 py-2.5 rounded-lg bg-white border border-gray-200">
                      <p className="text-xs font-semibold text-text-primary">{svc.name}</p>
                      <p className="text-[10px] text-text-tertiary mt-0.5 leading-snug">{svc.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

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
              href="https://github.com/Hrishikesh332/tl-compliance-intelligence"
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
