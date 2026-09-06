/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@trace/shared"],
  serverExternalPackages: ["pngjs", "jpeg-js"],
};
export default nextConfig;
