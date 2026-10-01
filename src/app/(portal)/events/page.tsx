import { Suspense } from "react";

import EventsPage from "~/features/events/events-page";

export const metadata = { title: "Events" };

export default function Page() {
  return (
    <Suspense>
      <EventsPage />
    </Suspense>
  );
}
