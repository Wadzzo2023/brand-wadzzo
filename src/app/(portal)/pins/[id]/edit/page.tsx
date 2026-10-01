import EditPinPage from "~/features/pins/edit-pin-page";

export const metadata = { title: "Edit pin" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditPinPage id={id} />;
}
