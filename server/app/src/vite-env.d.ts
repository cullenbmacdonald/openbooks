/// <reference types="vite/client" />

// framer-motion 7's `MotionProps` predates React 19's removal of `children`
// from `HTMLAttributes`/`DOMAttributes`, so `motion.div`'s prop type no
// longer accepts JSX children under `@types/react` 19. Restore it here.
// Safe to remove once framer-motion is bumped past this incompatibility.
import "framer-motion";
declare module "framer-motion" {
  interface MotionProps {
    children?: React.ReactNode;
  }
}
