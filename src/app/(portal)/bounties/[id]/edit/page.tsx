import EditBountyPage from "~/features/bounties/edit-bounty-page";

export const metadata = { title: "Edit bounty" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditBountyPage id={Number(id)} />;
}
