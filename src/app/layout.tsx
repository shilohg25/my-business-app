import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AKY Fuel Operations",
  description: "Fuel station shift and remittance operations"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
