import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import { ToastProvider } from "@/components/shared/toast";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Akiba Organization Portal",
  description: "Secure access to your organization in Akiba.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={outfit.variable}>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#3E0F8D",
};
