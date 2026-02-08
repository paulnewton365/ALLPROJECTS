/** @type {import('next').NextConfig} */
const fs = require("fs");
const path = require("path");

const version = fs.readFileSync(path.join(__dirname, "VERSION"), "utf-8").trim();

const nextConfig = {
  env: {
    BUILD_VERSION: version,
    BUILD_TIME: new Date().toISOString(),
    BUILD_COMMIT: (process.env.VERCEL_GIT_COMMIT_SHA || "local").slice(0, 7),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors * https://*.smartsheet.com https://*.smartsheetapps.com https://*.smartsheetgov.com" },
          { key: "Access-Control-Allow-Origin", value: "*" },
        ],
      },
    ];
  },
}
module.exports = nextConfig
