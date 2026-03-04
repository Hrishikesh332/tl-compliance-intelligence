import { useState, useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import OverviewPage from './pages/OverviewPage'
import Dashboard from './pages/Dashboard'
import VideoAnalysis from './pages/VideoAnalysis'
import EntitiesPage from './pages/EntitiesPage'
import Chatbot from './pages/Chatbot'
import UploadVideosModal from './components/UploadVideosModal'
import { VideoCacheProvider } from './contexts/VideoCache'
/* Strand: logo and icons from design system (strand/assets, strand/icons) */
import logoMarkUrl from '../strand/assets/logo-mark.svg?url'

const navItems = [
  { to: '/', label: 'Overview' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/entities', label: 'Entities' },
  { to: '/chat', label: 'Chat' },
]

function NavLinks({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  const location = useLocation()
  const navigate = useNavigate()
  const base = 'font-brand-xbold px-3 py-2 rounded-lg text-sm font-medium transition-colors border'
  const active = 'text-text-primary bg-card border-border'
  const inactive = 'border-transparent text-text-secondary hover:bg-card hover:text-text-primary'

  const handleClick = (e: React.MouseEvent, to: string) => {
    e.preventDefault()
    onNavigate?.()
    // From /video/*, client-side navigate often doesn't update the view (RR v7). Use full navigation.
    if (location.pathname.startsWith('/video/')) {
      window.location.href = to
      return
    }
    navigate(to)
  }

  return (
    <>
      {navItems.map((item) => {
        const isActive = item.to === '/' ? location.pathname === '/' : (location.pathname === item.to || location.pathname.startsWith(item.to + '/'))
        return (
          <button
            key={item.to}
            type="button"
            onClick={(e) => handleClick(e, item.to)}
            className={`${base} ${isActive ? active : inactive} ${mobile ? 'block w-full text-left' : ''}`}
          >
            {item.label}
          </button>
        )
      })}
    </>
  )
}

function Shell() {
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false)
      }
    }
    if (mobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.body.style.overflow = ''
    }
  }, [mobileMenuOpen])

  return (
    <div className="min-h-screen bg-background text-text-primary flex flex-col">
      <div className="relative" ref={menuRef}>
        <header className="bg-background px-4 py-3 flex items-center justify-between shrink-0 border-b border-border">
          <div className="flex items-center gap-3 min-w-0 flex-1 md:flex-initial">
            <div className="flex items-center gap-2 mr-2 md:mr-6 min-w-0">
              <button
                type="button"
                onClick={() => (location.pathname.startsWith('/video/') ? (window.location.href = '/') : navigate('/'))}
                className="font-brand text-text-primary hover:opacity-80 transition-opacity cursor-pointer shrink-0 text-left bg-transparent border-0 p-0 no-underline block"
                aria-label="Go to Overview"
              >
                <h1 className="text-base md:text-h5 font-medium truncate">Multi-Source Legal Evidence Investigator</h1>
              </button>
              <span className="hidden sm:inline-flex items-center px-2 py-1 rounded-sm border border-border bg-transparent text-text-secondary text-xs font-medium shrink-0 uppercase tracking-wide pointer-events-none select-none">
                SAMPLE APP
              </span>
            </div>

            {/* Desktop nav — hidden on mobile */}
            <nav className="hidden md:flex items-center gap-0.5">
              <NavLinks />
            </nav>
          </div>

          {/* Hamburger — visible only on mobile */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((o) => !o)}
            className={`md:hidden p-2 rounded-lg text-text-primary hover:bg-card border transition-colors ${
              mobileMenuOpen ? 'border-border bg-card' : 'border-transparent'
            }`}
            aria-expanded={mobileMenuOpen}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileMenuOpen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>

          {/* Brand — right side on desktop, hidden when menu open on small screens */}
          <div className={`flex items-center gap-2 shrink-0 ${mobileMenuOpen ? 'max-md:hidden' : ''}`}>
            <img src={logoMarkUrl} alt="" className="h-7 w-auto" />
            <span className="font-brand text-lg font-semibold text-text-primary hidden sm:inline">TwelveLabs</span>
          </div>
        </header>

        {/* Mobile menu dropdown */}
        <div
          className={`md:hidden absolute left-0 right-0 top-full z-50 bg-background border-b border-border shadow-lg transition-all duration-200 ease-out ${
            mobileMenuOpen ? 'opacity-100 visible' : 'opacity-0 invisible pointer-events-none'
          }`}
        >
          <nav className="flex flex-col p-3 gap-1">
            <NavLinks mobile onNavigate={() => setMobileMenuOpen(false)} />
          </nav>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-auto min-w-0">
          {/* Key by pathname so Routes remount when location updates (workaround for RR v7 transition delay) */}
          <Routes key={location.pathname} location={location}>
            <Route
              path="/dashboard"
              element={
                <div className="w-full min-w-0 px-3 sm:px-4 py-4 sm:py-6">
                  <Dashboard onOpenUpload={() => setUploadModalOpen(true)} />
                </div>
              }
            />
            <Route path="/entities" element={<EntitiesPage />} />
            <Route path="/chat" element={<Chatbot />} />
            <Route path="/video/:videoId" element={<VideoAnalysis />} />
            <Route path="/" element={<OverviewPage />} />
          </Routes>
        </main>
      </div>
      <UploadVideosModal open={uploadModalOpen} onClose={() => setUploadModalOpen(false)} />
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <VideoCacheProvider>
        <Shell />
      </VideoCacheProvider>
    </BrowserRouter>
  )
}

export default App
