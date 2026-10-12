import { ownerTick } from "@/lib/owner-notify";
import { sellerTick } from "@/lib/seller-notify";

// Every minute the server looks at what waits for the owner: paid orders whose item has to be
// bought are moved along (onto the owner's list, or owed back when their time is up), and the
// owner is told about anything new if a notice address is set. No page waits for it.
// The same round looks after the other sellers: their orders are moved along, and each seller who
// gave an address is told what is new for them (lib/seller-notify.ts). One failing does not stop
// the other.
const tick = async () => {
  await ownerTick().catch((error) => {
    console.error("owner: the round did not finish:", error instanceof Error ? error.message : error);
  });
  await sellerTick().catch((error) => {
    console.error("sellers: the round did not finish:", error instanceof Error ? error.message : error);
  });
};

const timer = globalThis as unknown as { zolaceOwnerTimer?: ReturnType<typeof setInterval> };
if (timer.zolaceOwnerTimer) clearInterval(timer.zolaceOwnerTimer);
timer.zolaceOwnerTimer = setInterval(tick, 60 * 1000);
timer.zolaceOwnerTimer.unref?.();
setTimeout(tick, 20_000).unref?.();
