import type { Config } from "@react-router/dev/config";

export default {
  // Config options...
  // Server-side render by default, to enable SPA mode set this to `false`
  ssr: true,
  future: {
    // Let Vite scan every route for dependencies at startup, so the first
    // page load doesn't find new ones and fail with 504 (Outdated Optimize Dep)
    unstable_optimizeDeps: true,
  },
} satisfies Config;
