import { Suspense } from "react";
import Page from "~/features/admin/user-details-page";
import { CenteredSpinner } from "~/ui/spinner";

export const metadata = { title: "User Details" };

export default async function Route({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  return (
    <Suspense fallback={<CenteredSpinner />}>
      <Page id={resolvedParams.id} />
    </Suspense>
  );
}
