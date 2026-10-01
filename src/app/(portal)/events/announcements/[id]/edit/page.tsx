import { EditAnnouncementPage } from "~/features/events/announcement-form-page";

export const metadata = { title: "Edit announcement" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditAnnouncementPage id={id} />;
}
