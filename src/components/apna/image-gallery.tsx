'use client'

import { useState } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight, Expand, X, UtensilsCrossed } from 'lucide-react'

export function ImageGallery({ images, alt, priority = false }: { images: string[]; alt: string; priority?: boolean }) {
  const [active, setActive] = useState(0)
  const [lightbox, setLightbox] = useState(false)

  if (images.length === 0) return <div className="grid aspect-square w-full place-items-center bg-muted text-brand/40"><UtensilsCrossed className="h-12 w-12" /></div>

  if (images.length === 1) {
    return (
      <>
        <button type="button" onClick={() => setLightbox(true)} className="relative aspect-square w-full overflow-hidden bg-muted">
          <Image src={images[0]} alt={alt} fill sizes="(max-width:768px) 100vw, 420px" priority={priority} className="object-cover" />
          <span className="absolute bottom-3 right-3 grid h-9 w-9 place-items-center rounded-full bg-black/50 text-white backdrop-blur"><Expand className="h-4 w-4" /></span>
        </button>
        {lightbox && <Lightbox images={images} alt={alt} startIndex={0} onClose={() => setLightbox(false)} />}
      </>
    )
  }

  return (
    <>
      <div className="relative aspect-square w-full overflow-hidden bg-muted">
        <AnimatePresence mode="wait">
          <motion.div key={active} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.2 }} className="absolute inset-0">
            <Image src={images[active]} alt={`${alt} - image ${active + 1}`} fill sizes="(max-width:768px) 100vw, 420px" priority={priority && active === 0} className="object-cover" />
          </motion.div>
        </AnimatePresence>
        {active > 0 && <button type="button" onClick={() => setActive((a) => a - 1)} className="absolute left-3 top-1/2 z-10 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 shadow-md backdrop-blur" aria-label="Previous image"><ChevronLeft className="h-5 w-5" /></button>}
        {active < images.length - 1 && <button type="button" onClick={() => setActive((a) => a + 1)} className="absolute right-3 top-1/2 z-10 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 shadow-md backdrop-blur" aria-label="Next image"><ChevronRight className="h-5 w-5" /></button>}
        <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs font-bold text-white backdrop-blur">{active + 1} / {images.length}</div>
        <button type="button" onClick={() => setLightbox(true)} className="absolute bottom-3 right-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-black/50 text-white backdrop-blur" aria-label="View fullscreen"><Expand className="h-4 w-4" /></button>
        <div className="absolute bottom-14 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
          {images.map((_, i) => <button key={i} type="button" onClick={() => setActive(i)} className={`h-1.5 rounded-full transition-all ${i === active ? 'w-6 bg-white' : 'w-1.5 bg-white/50'}`} aria-label={`Go to image ${i + 1}`} />)}
        </div>
      </div>
      {lightbox && <Lightbox images={images} alt={alt} startIndex={active} onClose={() => setLightbox(false)} />}
    </>
  )
}

function Lightbox({ images, alt, startIndex, onClose }: { images: string[]; alt: string; startIndex: number; onClose: () => void }) {
  const [active, setActive] = useState(startIndex)
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[1000] grid place-items-center bg-black/90 p-4" onClick={onClose}>
      <button type="button" onClick={(e) => { e.stopPropagation(); onClose() }} className="absolute right-4 top-4 z-10 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20" aria-label="Close"><X className="h-5 w-5" /></button>
      {active > 0 && <button type="button" onClick={(e) => { e.stopPropagation(); setActive((a) => a - 1) }} className="absolute left-4 top-1/2 z-10 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white backdrop-blur" aria-label="Previous"><ChevronLeft className="h-6 w-6" /></button>}
      {active < images.length - 1 && <button type="button" onClick={(e) => { e.stopPropagation(); setActive((a) => a + 1) }} className="absolute right-4 top-1/2 z-10 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white backdrop-blur" aria-label="Next"><ChevronRight className="h-6 w-6" /></button>}
      <motion.div key={active} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2 }} className="relative h-[80vh] w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <Image src={images[active]} alt={`${alt} - fullscreen ${active + 1}`} fill sizes="100vw" className="object-contain" />
      </motion.div>
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-bold text-white backdrop-blur">{active + 1} / {images.length}</div>
    </motion.div>
  )
}
