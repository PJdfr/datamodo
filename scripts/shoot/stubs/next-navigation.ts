// Stub of next/navigation for shoot harnesses — the shell only calls
// router.refresh()/push(), which are no-ops in a static file:// page.
export function useRouter() {
  return { refresh() {}, push() {}, replace() {}, back() {} };
}
export function usePathname() { return "/dashboard"; }
export function useSearchParams() { return new URLSearchParams(); }
