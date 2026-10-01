import PageAssetSalePage from "~/features/stores/page-asset-sale-page";

export const metadata = { title: "Edit listing" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PageAssetSalePage id={Number(id)} />;
}
