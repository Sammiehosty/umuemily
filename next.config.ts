import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/r/d", destination: "/public/debtors" },
      { source: "/r/m/:id", destination: "/public/member?id=:id" },
      { source: "/r/w/:month", destination: "/public/weekly?month=:month" },
      { source: "/r/b/:member/:year", destination: "/public/birthday?member=:member&year=:year" },
    ];
  },
};

export default nextConfig;
