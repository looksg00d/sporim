import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // The e2e run builds into its own directory so a `pnpm dev` already holding `.next`
  // does not make the suite fail with EPERM on Windows.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  // The design system ships as TypeScript source, not a build artefact.
  transpilePackages: ['@sporim/ui', '@sporim/domain'],
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: true }, // the monorepo runs eslint itself, once, at the root
  // The OG image reads its TTFs from disk at request time; a path built at runtime is one
  // the tracer cannot see, so the fonts are named here or the function ships without them.
  outputFileTracingIncludes: { '/b/**': ['./assets/og/**'] },
  // typedRoutes goes on in M1, once /new/* and /b/[id] actually exist.
};

export default config;
