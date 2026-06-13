"use client";

interface Props {
  totalLeads: number;
  assignedLeads: number;
}

export function LeadFunnelCard({
  totalLeads,
  assignedLeads,
}: Props) {
  const assignedPercent =
    totalLeads > 0
      ? Math.round((assignedLeads / totalLeads) * 100)
      : 0;

  const unassigned = totalLeads - assignedLeads;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <h3 className="text-white font-semibold mb-4">
        Lead Funnel
      </h3>

      <div className="space-y-4">
        <div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">
              Assigned Leads
            </span>

            <span className="text-white">
              {assignedLeads}
            </span>
          </div>

          <div className="mt-2 h-3 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-green-500"
              style={{
                width: `${assignedPercent}%`,
              }}
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">
              Unassigned Leads
            </span>

            <span className="text-white">
              {unassigned}
            </span>
          </div>

                    <div className="mt-2 h-3 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-orange-500"
              style={{
                width: `${
                  totalLeads > 0
                    ? Math.round((unassigned / totalLeads) * 100)
                    : 0
                }%`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}