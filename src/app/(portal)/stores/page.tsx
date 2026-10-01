import { Suspense } from "react";

import StoresPage from "~/features/stores/stores-page";

export const metadata = { title: "Stores" };

export default function Page() {
  return (
    <Suspense>
      <StoresPage />
    </Suspense>
  );
}
