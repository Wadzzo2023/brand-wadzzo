import { CollectionReport } from "~/features/reports/collection-report";

export const metadata = { title: "Collection reports" };

export default function Page() {
  return <CollectionReport scope="admin" />;
}
