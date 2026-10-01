import RedeemView from "~/features/reports/redeem-view";
import { PageBody, PageHeader } from "~/ui/page-header";

export const metadata = { title: "Redeem" };

export default function Page() {
  return (
    <PageBody>
      <PageHeader eyebrow="Insights" title="Redeem" description="Check a fan's code and redeem the reward they collected." />
      <div className="mt-6">
        <RedeemView />
      </div>
    </PageBody>
  );
}
