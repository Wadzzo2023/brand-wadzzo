import EditAssetPage from "~/features/stores/edit-asset-page";

export const metadata = { title: "Store item" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditAssetPage id={Number(id)} />;
}
