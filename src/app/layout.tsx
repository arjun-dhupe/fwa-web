import "./globals.css";

export const metadata = {
  title: "FWA – Fitness Wins App",
  description: "Track. Compete. Improve.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="elite-bg">{children}</body>
    </html>
  );
}