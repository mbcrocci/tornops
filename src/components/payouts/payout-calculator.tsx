import { ChartArea, Coins, Search, Swords, Users } from "lucide-react";
import { useId, useMemo, useState } from "react";
import type { FactionAttack } from "@/lib/faction";
import { parseMoney, type PayType, summarizePayouts } from "@/lib/payouts";
import { playerProfileLink } from "@/lib/links";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { formatPercent, formatRespect } from "../war-history/format";
import { PayoutSpread } from "./payout-spread";

const formatMoney = (amount: number) => `$${Math.floor(amount).toLocaleString()}`;

const formatRate = (amount: number) =>
  `$${amount.toLocaleString(undefined, { maximumFractionDigits: amount < 100 ? 2 : 0 })}`;

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="border-l-2 border-primary/60 pl-3">
      <div className="mb-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="font-mono text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

/**
 * Splits a payout between the members who made `attacks`, by respect or by hits, with the
 * spread charted and every member's share in a table.
 */
export function PayoutCalculator({
  attacks,
  title = "Payout",
  hitLabel = "Hits",
  hitDescription = "Hits are attacks that earned respect.",
}: {
  attacks: FactionAttack[];
  title?: string;
  /** What a counted hit is called, such as "War hits". */
  hitLabel?: string;
  hitDescription?: string;
}) {
  const id = useId();
  const [payoutInput, setPayoutInput] = useState("");
  const [payType, setPayType] = useState<PayType>("respect");
  const [includeBonus, setIncludeBonus] = useState(true);
  const [bonusMode, setBonusMode] = useState<"average" | "fixed">("average");
  const [bonusRespectInput, setBonusRespectInput] = useState("10");
  const [search, setSearch] = useState("");

  const payout = parseMoney(payoutInput) ?? 0;
  const fixedBonusRespect = Math.max(0, Number.parseFloat(bonusRespectInput) || 0);
  const bonusRespect = bonusMode === "average" ? "average" : fixedBonusRespect;
  const perRespect = payType === "respect";
  // Paying per hit ignores respect, so the bonus setting only applies per respect. The choice
  // is kept for when the pay type is switched back.
  const countActualBonus = !perRespect || includeBonus;
  const summary = useMemo(
    () =>
      summarizePayouts(attacks, {
        payout,
        payType,
        includeBonus: countActualBonus,
        bonusRespect,
      }),
    [attacks, payout, payType, countActualBonus, bonusRespect],
  );
  const query = search.trim().toLowerCase();
  const rows = summary.members.filter((member) => member.name.toLowerCase().includes(query));
  const payoutInvalid = payoutInput.trim() !== "" && parseMoney(payoutInput) === null;
  const unit = perRespect ? "respect" : "hit";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="size-4 text-primary" /> {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-payout`}>Payout</Label>
            <Input
              id={`${id}-payout`}
              className={cn("w-44 font-mono", payoutInvalid && "border-destructive")}
              inputMode="decimal"
              placeholder="e.g. 500m"
              value={payoutInput}
              aria-invalid={payoutInvalid}
              onChange={(event) => setPayoutInput(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-type`}>Type of pay</Label>
            <select
              id={`${id}-type`}
              className="h-9 rounded-md border bg-background px-3 text-sm text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={payType}
              onChange={(event) => setPayType(event.target.value as PayType)}
            >
              <option value="respect">Per respect</option>
              <option value="hit">Per hit</option>
            </select>
          </div>
          {perRespect && (
            <>
              <div className="flex h-9 items-center gap-2">
                <Checkbox
                  id={`${id}-bonus`}
                  checked={includeBonus}
                  onCheckedChange={(checked) => setIncludeBonus(checked === true)}
                />
                <Label htmlFor={`${id}-bonus`}>Include bonus</Label>
              </div>
              {!includeBonus && (
                <div className="grid gap-1.5">
                  <Label htmlFor={`${id}-bonus-mode`}>Respect per bonus hit</Label>
                  <div className="flex gap-2">
                    <select
                      id={`${id}-bonus-mode`}
                      className="h-9 rounded-md border bg-background px-3 text-sm text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={bonusMode}
                      onChange={(event) => setBonusMode(event.target.value as "average" | "fixed")}
                    >
                      <option value="average">Member's average per hit</option>
                      <option value="fixed">Fixed amount</option>
                    </select>
                    {bonusMode === "fixed" && (
                      <Input
                        id={`${id}-bonus-respect`}
                        aria-label="Respect per bonus hit"
                        className="w-28 font-mono"
                        type="number"
                        min={0}
                        step={0.01}
                        value={bonusRespectInput}
                        onChange={(event) => setBonusRespectInput(event.target.value)}
                      />
                    )}
                  </div>
                </div>
              )}
            </>
          )}
          <p className="basis-full text-xs text-muted-foreground">
            {perRespect
              ? `The payout is shared out by respect. ${
                  countActualBonus
                    ? "Chain bonus hits count the respect they earned."
                    : bonusMode === "average"
                      ? "Each chain bonus hit counts as the member's average respect over their other hits, or the faction's average if they only made bonus hits."
                      : `Each chain bonus hit counts as ${formatRespect(fixedBonusRespect)} respect.`
                }`
              : `The payout is shared out by ${hitLabel.toLowerCase()}. Chain bonus hits count as one hit like any other.`}
          </p>
        </CardContent>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="grid gap-5 bg-muted/30 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label={hitLabel}
            value={summary.hits.toLocaleString()}
            detail={`${attacks.length.toLocaleString()} attacks · ${summary.bonusHits} bonus hits`}
          />
          <Metric
            label="Members"
            value={summary.members.length.toLocaleString()}
            detail="earned respect"
          />
          <Metric
            label="Respect"
            value={formatRespect(summary.countedRespect)}
            detail={
              countActualBonus
                ? "earned for the faction"
                : `${formatRespect(summary.respect)} earned, bonus hits replaced`
            }
          />
          <Metric
            label={`Pay per ${unit}`}
            value={payout > 0 ? formatRate(summary.rate) : "–"}
            detail={
              payout > 0
                ? `${formatMoney(payout - summary.remainder)} of ${formatMoney(payout)} paid out`
                : "set a payout to split"
            }
          />
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ChartArea className="size-4 text-primary" /> Payout spread
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PayoutSpread members={summary.members} payout={payout} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="size-4 text-primary" /> Members
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {hitDescription} Payouts are rounded down to the dollar.
              </p>
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
          {summary.members.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              No attacks that earned respect.
            </p>
          ) : (
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-y bg-muted/35 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Member</th>
                  <th className="px-3 py-2 text-right font-medium">
                    <Swords className="mr-1 inline size-3" aria-hidden />
                    {hitLabel}
                  </th>
                  <th className="px-3 py-2 text-right font-medium">Bonus hits</th>
                  <th className="px-3 py-2 text-right font-medium">Respect earned</th>
                  {!countActualBonus && (
                    <th className="px-3 py-2 text-right font-medium">Respect counted</th>
                  )}
                  <th className="px-3 py-2 text-right font-medium">Share</th>
                  <th className="px-4 py-2 text-right font-medium">
                    <Coins className="mr-1 inline size-3" aria-hidden />
                    Payout
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((member) => (
                  <tr key={member.id} className="hover:bg-muted/25">
                    <td className="px-4 py-2.5">
                      <a
                        className="font-medium hover:text-primary hover:underline"
                        href={playerProfileLink(member.id)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {member.name}
                      </a>
                      <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                        {member.id}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {member.hits.toLocaleString()}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2.5 text-right font-mono tabular-nums",
                        member.bonusHits === 0 && "text-muted-foreground",
                      )}
                    >
                      {member.bonusHits}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {formatRespect(member.respect)}
                    </td>
                    {!countActualBonus && (
                      <td
                        className="px-3 py-2.5 text-right font-mono tabular-nums"
                        title={
                          member.bonusHitRespect === null
                            ? undefined
                            : `Each bonus hit counted as ${formatRespect(member.bonusHitRespect)} respect`
                        }
                      >
                        {formatRespect(member.countedRespect)}
                      </td>
                    )}
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {(member.share * 100).toFixed(2)}%
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-medium tabular-nums">
                      {payout > 0 ? formatMoney(member.payout) : "–"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t bg-muted/35 font-mono text-xs tabular-nums">
                <tr>
                  <td className="px-4 py-2 font-sans font-medium">Total</td>
                  <td className="px-3 py-2 text-right">{summary.hits.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">{summary.bonusHits}</td>
                  <td className="px-3 py-2 text-right">{formatRespect(summary.respect)}</td>
                  {!countActualBonus && (
                    <td className="px-3 py-2 text-right">
                      {formatRespect(summary.countedRespect)}
                    </td>
                  )}
                  <td className="px-3 py-2 text-right">{formatPercent(1)}</td>
                  <td className="px-4 py-2 text-right">
                    {payout > 0 ? formatMoney(payout - summary.remainder) : "–"}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
