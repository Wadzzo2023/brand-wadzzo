// Self-hosted fonts (same families as the fan apps): Sora body, Chakra Petch display.
import "@fontsource-variable/sora";
import "@fontsource/chakra-petch/500.css";
import "@fontsource/chakra-petch/600.css";
import "@fontsource/chakra-petch/700.css";
import "mapbox-gl/dist/mapbox-gl.css";
import "react-quill-new/dist/quill.snow.css";
import "~/styles/globals.css";

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { Providers } from "./providers";


export const metadata: Metadata = {
  title: { default: "Wadzzo Brand Portal", template: "%s · Wadzzo Brand Portal" },
  description: "Create and manage your drops, stores, posts, bounties and events on Wadzzo.",
  icons: { icon: "/favicon.ico" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f0f5f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0a100d" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: next-themes sets the class before hydration.
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
