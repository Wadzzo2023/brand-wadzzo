import { Suspense } from "react";
import Page from "~/features/admin/creator-details-page";
import { CenteredSpinner } from "~/ui/spinner";

export const metadata = { title: "Creator Details" };

export default async function Route({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  return (
    <Suspense fallback={<CenteredSpinner />}>
      <Page id={resolvedParams.id} />
    </Suspense>
  );
}
