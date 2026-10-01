import { Suspense } from "react";

import Page from "~/features/posts/posts-page";
import { CenteredSpinner } from "~/ui/spinner";

export const metadata = { title: "Posts" };

export default function Route() {
  return (
    <Suspense fallback={<CenteredSpinner />}>
      <Page />
    </Suspense>
  );
}
