import type { NextConfig } from "next";
import webpack from "webpack";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  // Disable Turbopack by setting empty config
  turbopack: {},
  // Use webpack instead of Turbopack
  webpack: (config) => {
    // Replace test files with empty modules
    config.plugins = [
      ...(config.plugins || []),
      new webpack.NormalModuleReplacementPlugin(
        /\.test\.(js|ts|mjs)$/,
        require.resolve("./webpack-test-stub.js")
      ),
      new webpack.NormalModuleReplacementPlugin(
        /\/decorators\/test\.js$/,
        require.resolve("./webpack-test-stub.js")
      ),
    ];

    return config;
  },
};

export default nextConfig;
