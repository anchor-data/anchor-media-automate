import { DashboardClient } from "../components/dashboard-client";
import { fetchDashboardData } from "../lib/api";

export default async function HomePage() {
  const data = await fetchDashboardData();
  return <DashboardClient initialData={data} />;
}
