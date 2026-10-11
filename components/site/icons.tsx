import type { Icon } from "@phosphor-icons/react"
import {
  Browser,
  Coins,
  Cube,
  DeviceMobile,
  EyeSlash,
  Gift,
  HardDrives,
  Key,
  LockKey,
  PaperPlaneTilt,
  Sparkle,
  Ticket,
  Timer,
  UserCircleDashed,
  Wallet,
} from "@phosphor-icons/react/ssr"

// The pictograms of the site, named for what they stand for. All of them are Phosphor's duotone
// weight: an outline over a faint fill in the same colour, so an icon reads as a small shape of
// its own and needs no tile behind it. Controls (arrows, chevrons, copy, check) stay lucide's, as
// shadcn/ui ships them.
function duotone(Source: Icon) {
  return function SiteIcon({ className }: { className?: string }) {
    return <Source weight="duotone" aria-hidden className={className} />
  }
}

export const ShelfIcon = duotone(Ticket)
export const NoAccountIcon = duotone(UserCircleDashed)
export const PriceLockIcon = duotone(Timer)
export const SealIcon = duotone(LockKey)
export const KeyIcon = duotone(Key)
export const TokenIcon = duotone(Coins)
export const BlockIcon = duotone(Cube)
export const NoTrackingIcon = duotone(EyeSlash)
export const BrowserIcon = duotone(Browser)
export const ServerIcon = duotone(HardDrives)
export const WalletIcon = duotone(Wallet)
export const GiftIcon = duotone(Gift)
export const SparkIcon = duotone(Sparkle)
export const PhoneIcon = duotone(DeviceMobile)
export const SendIcon = duotone(PaperPlaneTilt)
