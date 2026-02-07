export const metadata = {
  title: "Project Snapshot Dashboard",
  description: "Weekly project status, financials, and workload from Smartsheet",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
