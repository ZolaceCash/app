import { FaXTwitter } from "react-icons/fa6"

// The project's one account on X. The menu and the footer both link to it from here.
export const X_HANDLE = "zolacedotcash"
export const X_URL = `https://x.com/${X_HANDLE}`

// A brand mark, so it is not one of Phosphor's pictograms (components/site/icons.tsx).
export function XIcon({ className }: { className?: string }) {
  return <FaXTwitter aria-hidden className={className} />
}
