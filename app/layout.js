export const metadata = {
  title: "Antenna Group — All Projects Dashboard",
  description: "Weekly project status, financials, and workload from Smartsheet",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://allprojects-kappa.vercel.app";
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="https://fullyconscious.com/favicon.ico" sizes="any" />
        <link rel="icon" href="https://fullyconscious.com/favicon.ico" type="image/x-icon" />
        <link rel="alternate" type="application/json+oembed" href={`${siteUrl}/api/oembed?url=${encodeURIComponent(siteUrl)}&format=json`} title="Antenna Group Dashboard" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Antenna Group — All Projects Dashboard" />
        <meta property="og:description" content="Live project status, financials, and pipeline from Smartsheet" />
        <meta property="og:url" content={siteUrl} />
        <meta name="iframely:title" content="Antenna Group — All Projects Dashboard" />
      </head>
      <body>{children}</body>
    </html>
  );
}
