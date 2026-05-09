/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages export raw TypeScript source — let Next.js transpile
  // them through SWC instead of expecting prebuilt JS.
  transpilePackages: ["@ring0/personas", "@ring0/pipeline"],
};

export default nextConfig;
