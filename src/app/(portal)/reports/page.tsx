import { CollectionReport } from "~/features/reports/collection-report";

export const metadata = { title: "Reports" };

export default function Page() {
  return <CollectionReport scope="brand" />;
}
