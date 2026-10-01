import { Suspense } from "react";

import Page from "~/features/posts/post-detail-page";
import { CenteredSpinner } from "~/ui/spinner";

export const metadata = { title: "Post" };

export default function Route() {
  return (
    <Suspense fallback={<CenteredSpinner />}>
      <Page />
    </Suspense>
  );
}
