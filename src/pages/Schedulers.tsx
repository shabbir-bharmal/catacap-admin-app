import { AdminLayout } from "../components/AdminLayout";
import SchedulersTab from "@/components/SchedulersTab";

export default function Schedulers() {
  return (
    <AdminLayout title="Schedulers">
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold" data-testid="text-page-heading">
          Schedulers
        </h1>
        <SchedulersTab />
      </div>
    </AdminLayout>
  );
}
