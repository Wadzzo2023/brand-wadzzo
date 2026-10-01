import { EditEventPage } from "~/features/events/event-form-page";

export const metadata = { title: "Edit event" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditEventPage id={id} />;
}
