import EditHotspotPage from "~/features/pins/edit-hotspot-page";

export const metadata = { title: "Edit hotspot" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditHotspotPage hotspotId={id} />;
}
