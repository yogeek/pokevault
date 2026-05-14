import type { Condition, WishlistPriority } from '@/types'

const conditionColors: Record<Condition, string> = {
  M:  'bg-violet-500 text-white',
  NM: 'bg-green-600 text-white',
  EX: 'bg-lime-600 text-white',
  GD: 'bg-yellow-500 text-slate-900',
  LP: 'bg-orange-500 text-white',
  PL: 'bg-red-500 text-white',
  P:  'bg-slate-600 text-slate-200',
}

const priorityLabels: Record<WishlistPriority, string> = {
  1: 'Indispensable',
  2: 'Souhaité',
  3: 'Sympa',
}

const priorityColors: Record<WishlistPriority, string> = {
  1: 'bg-red-600 text-white',
  2: 'bg-amber-500 text-slate-900',
  3: 'bg-slate-600 text-slate-200',
}

export function ConditionBadge({ condition }: { condition: Condition }) {
  return (
    <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded ${conditionColors[condition]}`}>
      {condition}
    </span>
  )
}

export function PriorityBadge({ priority }: { priority: WishlistPriority }) {
  return (
    <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded ${priorityColors[priority]}`}>
      {priorityLabels[priority]}
    </span>
  )
}

export function Badge({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${className}`}>
      {children}
    </span>
  )
}
