"use client";

import { PageBody, PageHeader } from "~/ui/page-header";

import AnalyticsView from "./analytics-view";

/** Reports: how your pins are collected. Redeem is its own page (/redeem). */
export default function ReportsPage() {
  return (
    <PageBody>
      <PageHeader eyebrow="Insights" title="Reports" description="How your pins are collected, by whom and where." />
      <div className="mt-6">
        <AnalyticsView />
      </div>
    </PageBody>
  );
}
