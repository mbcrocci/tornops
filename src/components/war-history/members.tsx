import { ArrowDown, Search, UserCheck, UserX } from "lucide-react";
import { useState } from "react";
import {
  type AbsentMember,
  ENERGY_PER_ATTACK,
  type MemberBonuses,
  type MemberSummary,
} from "@/lib/war-analysis";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { formatPercent, formatRespect, formatWindow } from "./format";

type SortKey =
  | "reliability"
  | "hits"
  | "failed"
  | "energy"
  | "xanax"
  | "chainWatch"
  | "respectPerHit"
  | "respect"
  | "hitsTaken";

const SORTERS: Record<
  SortKey,
  (member: MemberSummary, armoryXanax: Map<number, number> | undefined) => number
> = {
  reliability: (member) => member.reliableWindow?.confidence ?? 0,
  hits: (member) => member.hits,
  failed: (member) => (member.attacks ? member.failed / member.attacks : 0),
  energy: (member) => member.energy,
  xanax: (member, armoryXanax) => armoryXanax?.get(member.id) ?? 0,
  chainWatch: (member) => member.chainWatch ?? 0,
  respectPerHit: (member) => member.respectPerHit,
  respect: (member) => member.respect,
  hitsTaken: (member) => member.hitsTaken,
};

const hasBonuses = (bonuses: MemberBonuses) =>
  bonuses.chainBonuses.length > 0 ||
  bonuses.modifiers.length > 0 ||
  (bonuses.averageChainMultiplier ?? 1) > 1;

function BonusBreakdown({ bonuses }: { bonuses: MemberBonuses }) {
  return (
    <div className="grid gap-1.5 py-0.5 text-left font-mono">
      {bonuses.chainBonuses.length > 0 && (
        <div>
          <div className="mb-0.5 text-[10px] uppercase tracking-wider opacity-70">
            Chain bonus hits
          </div>
          {bonuses.chainBonuses.map((bonus) => (
            <div key={bonus.chain} className="flex justify-between gap-4 tabular-nums">
              <span>#{bonus.chain.toLocaleString()}</span>
              <span>{formatRespect(bonus.respect)}</span>
            </div>
          ))}
        </div>
      )}
      {(bonuses.modifiers.length > 0 || (bonuses.averageChainMultiplier ?? 1) > 1) && (
        <div>
          <div className="mb-0.5 text-[10px] uppercase tracking-wider opacity-70">
            Respect modifiers
          </div>
          {(bonuses.averageChainMultiplier ?? 1) > 1 && (
            <div className="flex justify-between gap-4 tabular-nums">
              <span>Chain</span>
              <span>{bonuses.averageChainMultiplier?.toFixed(2)}× avg</span>
            </div>
          )}
          {bonuses.modifiers.map((modifier) => (
            <div key={modifier.key} className="flex justify-between gap-4 tabular-nums">
              <span>{modifier.label}</span>
              <span>
                {modifier.hits} {modifier.hits === 1 ? "hit" : "hits"} ·{" "}
                {modifier.averageMultiplier.toFixed(2)}×
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProfileLink({ id, name }: { id: number; name: string }) {
  return (
    <a
      className="font-medium hover:text-primary hover:underline"
      href={`https://www.torn.com/profiles.php?XID=${id}`}
      target="_blank"
      rel="noreferrer"
    >
      {name}
    </a>
  );
}

function SortHeader({
  label,
  sortKey,
  active,
  onSort,
  align = "left",
  title,
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
  title?: string;
}) {
  return (
    <th
      className={cn("px-3 py-2 font-medium", align === "right" && "text-right")}
      aria-sort={active === sortKey ? "descending" : undefined}
    >
      <button
        type="button"
        title={title}
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          active === sortKey && "text-foreground",
        )}
      >
        {label}
        {active === sortKey && <ArrowDown className="size-3" />}
      </button>
    </th>
  );
}

export function MemberTable({
  members,
  armoryXanax,
  armoryXanaxError,
}: {
  members: MemberSummary[];
  armoryXanax?: Map<number, number>;
  armoryXanaxError?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("reliability");
  const showFairFight = members.some((member) => member.fairFight !== null);
  const query = search.trim().toLowerCase();
  const rows = members
    .filter((member) => member.attacks > 0 && member.name.toLowerCase().includes(query))
    .sort(
      (a, b) =>
        SORTERS[sortKey](b, armoryXanax) - SORTERS[sortKey](a, armoryXanax) || b.hits - a.hits,
    );
  const sortProps = { active: sortKey, onSort: setSortKey };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <CardTitle className="flex items-center gap-2">
              <UserCheck className="size-4 text-primary" /> Who can I count on?
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Each member's most dependable three-hour window, and how well they hit
            </p>
            {armoryXanaxError && (
              <p className="mt-1 text-xs text-destructive">
                Armory Xanax use could not be loaded. It needs faction API access on the key.
              </p>
            )}
          </div>
          <label className="relative block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="w-full pl-8 sm:w-60"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Find a member"
            />
          </label>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto px-0">
        <table className="w-full min-w-[1200px] text-sm">
          <thead className="border-y bg-muted/35 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Member</th>
              <th className="px-3 py-2 font-medium">Best window</th>
              <SortHeader
                label="Reliability"
                sortKey="reliability"
                title="A cautious estimate that rewards being seen on many days, not one lucky day"
                {...sortProps}
              />
              <SortHeader label="Hits" sortKey="hits" {...sortProps} />
              <SortHeader label="Wasted" sortKey="failed" {...sortProps} />
              <SortHeader
                label="Energy"
                sortKey="energy"
                align="right"
                title={`${ENERGY_PER_ATTACK} energy per attack, including assists and failed attacks, less what Revitalize procs gave back`}
                {...sortProps}
              />
              <SortHeader
                label="Respect / hit"
                sortKey="respectPerHit"
                align="right"
                title="Chain bonus hits excluded"
                {...sortProps}
              />
              <SortHeader
                label="Chain watch"
                sortKey="chainWatch"
                align="right"
                title="Sum over their chain hits of the time since the previous chain hit, divided by the chain's length. High means they kept the chain alive."
                {...sortProps}
              />
              <SortHeader
                label="Armory Xanax"
                sortKey="xanax"
                align="right"
                title="Xanax taken from the faction armory during the selected wars"
                {...sortProps}
              />
              {showFairFight && <th className="px-3 py-2 text-right font-medium">Fair fight</th>}
              <SortHeader label="Respect" sortKey="respect" align="right" {...sortProps} />
              <SortHeader label="Hits taken" sortKey="hitsTaken" align="right" {...sortProps} />
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((member) => {
              const window = member.reliableWindow;
              return (
                <tr key={member.id} className="hover:bg-muted/25">
                  <td className="px-4 py-2.5">
                    <ProfileLink id={member.id} name={member.name} />
                    <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                      {member.id}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs font-medium">
                    {window ? formatWindow(window.startHour) : "–"}
                  </td>
                  <td className="px-3 py-2.5">
                    {window ? (
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 bg-muted">
                          <div
                            className={cn(
                              "h-full",
                              window.confidence >= 0.6
                                ? "bg-primary"
                                : window.confidence >= 0.3
                                  ? "bg-primary/60"
                                  : "bg-muted-foreground/50",
                            )}
                            style={{ width: `${window.confidence * 100}%` }}
                          />
                        </div>
                        <span className="font-mono text-xs tabular-nums">
                          {formatPercent(window.confidence)}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {window.daysSeen}/{window.sampledDays} days
                        </span>
                      </div>
                    ) : (
                      "–"
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-mono tabular-nums">
                    {member.hits}
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      / {member.attacks}
                    </span>
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2.5 font-mono tabular-nums",
                      member.failed === 0 && "text-muted-foreground",
                    )}
                  >
                    {member.failed}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                    {member.energy.toLocaleString()}
                    <span className="ml-1 text-[10px] text-muted-foreground">E</span>
                    {member.revitalizeProcs > 0 && (
                      <div
                        className="text-[10px] text-emerald-600 dark:text-emerald-400"
                        title={`${member.revitalizeProcs * ENERGY_PER_ATTACK} energy given back by Revitalize`}
                      >
                        {member.revitalizeProcs} revitalize
                      </div>
                    )}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2.5 text-right font-mono tabular-nums",
                      !member.chainWatch && "text-muted-foreground",
                    )}
                  >
                    {member.chainWatch === null ? "–" : `${(member.chainWatch * 100).toFixed(1)}%`}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2.5 text-right font-mono tabular-nums",
                      !armoryXanax?.get(member.id) && "text-muted-foreground",
                    )}
                  >
                    {armoryXanax ? (armoryXanax.get(member.id) ?? 0) : "–"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                    {member.hits - member.bonusHits > 0 ? formatRespect(member.respectPerHit) : "–"}
                  </td>
                  {showFairFight && (
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {member.fairFight === null ? "–" : `${member.fairFight.toFixed(2)}×`}
                    </td>
                  )}
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                    {hasBonuses(member.bonuses) ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help underline decoration-dotted decoration-muted-foreground/60 underline-offset-4">
                            {formatRespect(member.respect)}
                            {member.bonusHits > 0 && (
                              <span className="ml-1 text-[10px] text-muted-foreground">+bonus</span>
                            )}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="left">
                          <BonusBreakdown bonuses={member.bonuses} />
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      formatRespect(member.respect)
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    {member.hitsTaken}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No member matches that search.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

const JOINED_LABELS: Record<AbsentMember["joined"], string> = {
  before: "In the faction for every selected war",
  during: "Joined while the selected wars were running",
  after: "Joined after the selected wars",
};

export function AbsentMembers({
  absent,
  rosterAvailable,
}: {
  absent: AbsentMember[];
  rosterAvailable: boolean;
}) {
  const groups = (["before", "during", "after"] as const)
    .map((joined) => ({ joined, members: absent.filter((member) => member.joined === joined) }))
    .filter((group) => group.members.length > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserX className="size-4 text-destructive" /> No successful war hits
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Current members without a single scoring hit in the selected wars. Join dates are
          estimated from days in faction.
        </p>
      </CardHeader>
      <CardContent>
        {!rosterAvailable ? (
          <p className="text-sm text-muted-foreground">
            The faction roster could not be loaded, so members without hits can't be listed.
          </p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">Every current member landed a hit.</p>
        ) : (
          <div className="space-y-5">
            {groups.map((group) => (
              <section key={group.joined}>
                <h3
                  className={cn(
                    "mb-2 text-xs font-medium",
                    group.joined === "before" ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {JOINED_LABELS[group.joined]} · {group.members.length}
                </h3>
                <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {group.members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-baseline justify-between gap-3 border-b border-dashed py-1 text-sm"
                    >
                      <span className="min-w-0 truncate">
                        <ProfileLink id={member.id} name={member.name} />
                        <span className="ml-2 text-[10px] text-muted-foreground">
                          {member.position}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                        {member.hitsTaken > 0 && `hit ${member.hitsTaken}× · `}
                        {member.daysInFaction}d in faction
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
