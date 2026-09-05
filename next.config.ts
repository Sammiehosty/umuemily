import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/family/debtors", destination: "/public/debtors" },
      { source: "/family/member", destination: "/public/member" },
      { source: "/family/birthday", destination: "/public/birthday" },
      { source: "/family/weekly", destination: "/public/weekly" },
    ];
  },
  async redirects() {
    return [
      { source: "/public/debtors", destination: "/family/debtors", permanent: false },
      { source: "/public/member", destination: "/family/member", permanent: false },
      { source: "/public/birthday", destination: "/family/birthday", permanent: false },
      { source: "/public/weekly", destination: "/family/weekly", permanent: false },
    ];
  },
};

export default nextConfig;
