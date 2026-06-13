"use client";

interface TeamMember {
  userId: string;
  fullName: string;
  assignedLeads: number;
  openDeals: number;
  openTasks: number;
}

interface Props {
  members: TeamMember[];
}

export function TeamPerformanceCard({
  members,
}: Props) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <h3 className="text-white font-semibold mb-4">
        Team Performance
      </h3>

      <div className="space-y-3">
        {members.length === 0 ? (
          <p className="text-slate-500 text-sm">
            No team members found.
          </p>
        ) : (
          members.map((member) => (
            <div
              key={member.userId}
              className="rounded-lg border border-slate-800 p-3"
            >
              <div className="font-medium text-white">
                {member.fullName}
              </div>

              <div className="mt-2 grid grid-cols-3 gap-3 text-xs">
                <div>
                  <div className="text-slate-500">
                    Leads
                  </div>
                  <div className="text-white">
                    {member.assignedLeads}
                  </div>
                </div>

                <div>
                  <div className="text-slate-500">
                    Deals
                  </div>
                  <div className="text-white">
                    {member.openDeals}
                  </div>
                </div>

                <div>
                  <div className="text-slate-500">
                    Tasks
                  </div>
                  <div className="text-white">
                    {member.openTasks}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}