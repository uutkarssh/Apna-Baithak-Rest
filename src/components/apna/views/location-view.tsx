'use client'

import dynamic from 'next/dynamic'

// react-leaflet references `window` at module load — must be client-only.
const LocationView = dynamic(() => import('./location-view-inner').then((m) => m.LocationView), {
  ssr: false,
  loading: () => (
    <div className="grid h-[60vh] place-items-center text-sm text-muted-foreground">
      Loading map…
    </div>
  ),
})

export default LocationView
