import "./globals.css";

export const metadata = {
  title: "FWA – Fitness With Arjun",
  description: "Your AI-powered fitness dashboard for sleep, hydration, workouts and recovery.",
  openGraph: {
    title: "FWA – Fitness With Arjun",
    description: "Your AI-powered fitness dashboard",
    siteName: "Fitness With Arjun",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="elite-bg">{children}</body>
    </html>
  );
}