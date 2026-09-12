'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Star, GripVertical, Loader2, Plus, X, Image as ImageIcon } from 'lucide-react'
import { rupees } from '@/lib/format'
import { toast } from 'sonner'

type AdminItem = {
  id: string
  name: string
  slug: string
  price: number
  isFeatured: boolean
  featuredOrder: number | null
  images?: { url: string }[]
  imageUrl?: string | null
  category?: { name: string; slug: string } | null
}

/**
 * FeaturedTab — admin panel for managing which menu items appear in the
 * homepage "Featured Items" section, and in what order.
 *
 * Two sections:
 *  1. "Featured Items (drag to reorder)" — a drag-and-drop list of currently
 *     featured items, ordered by featuredOrder. Admin can drag to reorder;
 *     the new order is persisted to the DB immediately on drag end.
 *  2. "All Menu Items" — a list of all items with a star toggle to mark/
 *     unmark as featured. Marking appends to the end of the featured list;
 *     unmarking removes and closes the gap.
 */
export function FeaturedTab() {
  const qc = useQueryClient()
  const [reordering, setReordering] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Require a small movement before drag starts, so clicks on the
      // remove button don't accidentally trigger a drag.
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Fetch ALL items (for the "All Menu Items" toggle list)
  const { data: allData, isLoading: allLoading } = useQuery({
    queryKey: ['admin-menu-items'],
    queryFn: async () => {
      const res = await fetch('/api/admin/menu/items')
      if (!res.ok) throw new Error('Failed to load items')
      return res.json() as Promise<{ items: AdminItem[] }>
    },
  })

  // Fetch featured items (for the drag-to-reorder list)
  const { data: featuredData } = useQuery({
    queryKey: ['admin-featured'],
    queryFn: async () => {
      const res = await fetch('/api/admin/menu/featured')
      if (!res.ok) throw new Error('Failed to load featured items')
      return res.json() as Promise<{ items: AdminItem[] }>
    },
  })

  const allItems = allData?.items ?? []
  const featuredItems = featuredData?.items ?? []

  // === Toggle featured status ===
  async function toggleFeatured(itemId: string, currentlyFeatured: boolean) {
    try {
      const res = await fetch('/api/admin/menu/featured', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, isFeatured: !currentlyFeatured }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Failed to toggle')
      }
      toast.success(currentlyFeatured ? 'Removed from featured' : 'Added to featured')
      qc.invalidateQueries({ queryKey: ['admin-featured'] })
      qc.invalidateQueries({ queryKey: ['admin-menu-items'] })
      qc.invalidateQueries({ queryKey: ['menu-featured'] }) // public homepage cache
    } catch (e: any) {
      toast.error(e.message || 'Failed to toggle')
    }
  }

  // === Drag end — reorder ===
  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    // Compute the new order locally first (for instant UI feedback)
    const oldIndex = featuredItems.findIndex((i) => i.id === active.id)
    const newIndex = featuredItems.findIndex((i) => i.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const newOrder = arrayMove(featuredItems, oldIndex, newIndex)
    const orderedIds = newOrder.map((i) => i.id)

    // Optimistically update the cache so the UI snaps instantly
    qc.setQueryData(['admin-featured'], { items: newOrder })

    // Persist to DB
    setReordering(true)
    try {
      const res = await fetch('/api/admin/menu/featured', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Failed to reorder')
      }
      // Invalidate to sync with server truth
      qc.invalidateQueries({ queryKey: ['admin-featured'] })
      qc.invalidateQueries({ queryKey: ['menu-featured'] }) // public homepage cache
    } catch (e: any) {
      toast.error(e.message || 'Failed to save order')
      // Revert on failure
      qc.invalidateQueries({ queryKey: ['admin-featured'] })
    } finally {
      setReordering(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Section 1: Featured Items (drag to reorder) */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-bold text-foreground">Featured Items</h3>
            <span className="rounded-full bg-brand-softer px-2 py-0.5 text-[10px] font-bold text-brand">
              {featuredItems.length}
            </span>
          </div>
          {reordering && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Saving…
            </span>
          )}
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Drag items up/down to set the display order on the homepage. The top item shows first.
        </p>

        {featuredItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center">
            <Star className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium text-muted-foreground">No featured items yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Mark items as featured from the list below — they'll appear on the homepage.
            </p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={featuredItems.map((i) => i.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col gap-2">
                {featuredItems.map((item, index) => (
                  <SortableFeaturedItem
                    key={item.id}
                    item={item}
                    index={index}
                    onRemove={() => toggleFeatured(item.id, true)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Section 2: All Menu Items (toggle featured) */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Plus className="h-4 w-4 text-brand" />
          <h3 className="text-sm font-bold text-foreground">All Menu Items</h3>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
            {allItems.length}
          </span>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Tap the star to add/remove items from the Featured section above.
        </p>

        {allLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-brand" />
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {allItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/30 p-2.5"
              >
                {/* Thumbnail */}
                <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {(item.imageUrl || item.images?.[0]?.url) ? (
                    <img
                      src={item.imageUrl || item.images?.[0]?.url}
                      alt={item.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center">
                      <ImageIcon className="h-4 w-4 text-muted-foreground/50" />
                    </div>
                  )}
                </div>

                {/* Name + price */}
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-sm font-semibold text-foreground">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {rupees(item.price)}
                    {item.category ? ` · ${item.category.name}` : ''}
                  </p>
                </div>

                {/* Star toggle */}
                <button
                  onClick={() => toggleFeatured(item.id, item.isFeatured)}
                  className={`shrink-0 rounded-lg p-2 transition ${
                    item.isFeatured
                      ? 'bg-amber-100 text-amber-600 hover:bg-amber-200'
                      : 'bg-muted text-muted-foreground hover:bg-muted/70'
                  }`}
                  title={item.isFeatured ? 'Remove from featured' : 'Add to featured'}
                >
                  <Star className={`h-4 w-4 ${item.isFeatured ? 'fill-amber-500' : ''}`} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// === Sortable featured item (drag handle) ===
function SortableFeaturedItem({
  item,
  index,
  onRemove,
}: {
  item: AdminItem
  index: number
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 'auto',
    opacity: isDragging ? 0.8 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 rounded-xl border bg-card p-2.5 shadow-sm transition ${
        isDragging ? 'border-brand shadow-lg' : 'border-border'
      }`}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab touch-none rounded p-1 text-muted-foreground hover:text-foreground active:cursor-grabbing"
        title="Drag to reorder"
      >
        <GripVertical className="h-5 w-5" />
      </button>

      {/* Position number */}
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-softer text-[11px] font-bold text-brand">
        {index + 1}
      </span>

      {/* Thumbnail */}
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-muted">
        {(item.imageUrl || item.images?.[0]?.url) ? (
          <img
            src={item.imageUrl || item.images?.[0]?.url}
            alt={item.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full w-full place-items-center">
            <ImageIcon className="h-4 w-4 text-muted-foreground/50" />
          </div>
        )}
      </div>

      {/* Name + price */}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-1 text-sm font-semibold text-foreground">{item.name}</p>
        <p className="text-xs text-muted-foreground">{rupees(item.price)}</p>
      </div>

      {/* Remove button */}
      <button
        onClick={onRemove}
        className="shrink-0 rounded-lg p-2 text-muted-foreground transition hover:bg-red-50 hover:text-red-600"
        title="Remove from featured"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
