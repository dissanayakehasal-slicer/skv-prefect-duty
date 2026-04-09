import { useDeferredValue, useMemo, useState } from 'react';
import { Search, Trophy, PlusCircle, MinusCircle, History, Users } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { usePrefectStore } from '@/store/prefectStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useShallow } from 'zustand/react/shallow';

export function StandingsTab() {
  const { prefects, pointLogs, standingsPoints, applyPointChange } = usePrefectStore(useShallow((state) => ({
    prefects: state.prefects,
    pointLogs: state.pointLogs,
    standingsPoints: state.standingsPoints,
    applyPointChange: state.applyPointChange,
  })));
  const [search, setSearch] = useState('');
  const [selectedPrefectIds, setSelectedPrefectIds] = useState<string[]>([]);
  const [bulkAmount, setBulkAmount] = useState('5');
  const [bulkReason, setBulkReason] = useState('');
  const [singleAmountById, setSingleAmountById] = useState<Record<string, string>>({});
  const [singleReasonById, setSingleReasonById] = useState<Record<string, string>>({});
  const deferredSearch = useDeferredValue(search);
  const pointsByPrefect = standingsPoints;

  const latestLogByPrefectId = useMemo(() => {
    const map = new Map<string, typeof pointLogs[number]>();
    pointLogs.forEach((log) => {
      if (!map.has(log.prefectId)) map.set(log.prefectId, log);
    });
    return map;
  }, [pointLogs]);

  const prefectById = useMemo(() => new Map(prefects.map((prefect) => [prefect.id, prefect])), [prefects]);

  const standings = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();

    return [...prefects]
      .filter((prefect) => {
        if (!query) return true;
        return (
          prefect.name.toLowerCase().includes(query) ||
          prefect.regNo.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        const pointDiff = (pointsByPrefect[b.id] ?? 1000) - (pointsByPrefect[a.id] ?? 1000);
        if (pointDiff !== 0) return pointDiff;
        return a.name.localeCompare(b.name);
      });
  }, [deferredSearch, pointsByPrefect, prefects]);

  const recentLogs = useMemo(() => {
    return pointLogs
      .filter((log) => prefectById.has(log.prefectId))
      .slice(0, 12);
  }, [pointLogs, prefectById]);

  const submitSingleChange = async (prefectId: string, direction: 'add' | 'deduct') => {
    const rawAmount = singleAmountById[prefectId] ?? '5';
    const amount = Math.abs(parseInt(rawAmount, 10) || 0) * (direction === 'add' ? 1 : -1);
    const reason = singleReasonById[prefectId] ?? '';
    const error = await applyPointChange([prefectId], amount, reason);

    if (error) {
      toast.error(error);
      return;
    }

    setSingleReasonById((current) => ({ ...current, [prefectId]: '' }));
    toast.success(direction === 'add' ? 'Points added' : 'Points deducted');
  };

  const submitBulkChange = async (direction: 'add' | 'deduct') => {
    const amount = Math.abs(parseInt(bulkAmount, 10) || 0) * (direction === 'add' ? 1 : -1);
    const error = await applyPointChange(selectedPrefectIds, amount, bulkReason);

    if (error) {
      toast.error(error);
      return;
    }

    setBulkReason('');
    setSelectedPrefectIds([]);
    toast.success(direction === 'add' ? 'Bulk points added' : 'Bulk points deducted');
  };

  const togglePrefectSelection = (prefectId: string, checked: boolean) => {
    setSelectedPrefectIds((current) => (
      checked
        ? Array.from(new Set([...current, prefectId]))
        : current.filter((id) => id !== prefectId)
    ));
  };

  const toggleVisibleSelection = (checked: boolean) => {
    setSelectedPrefectIds((current) => {
      const visibleIds = standings.map((prefect) => prefect.id);
      if (checked) return Array.from(new Set([...current, ...visibleIds]));
      return current.filter((id) => !visibleIds.includes(id));
    });
  };

  const allVisibleSelected = standings.length > 0 && standings.every((prefect) => selectedPrefectIds.includes(prefect.id));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">Standings</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Every prefect starts at 1000 points</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 w-full md:w-auto">
          <div className="duty-card min-w-[170px]">
            <p className="text-xs text-muted-foreground">Prefects ranked</p>
            <p className="text-2xl font-bold text-foreground">{prefects.length}</p>
          </div>
          <div className="duty-card min-w-[170px]">
            <p className="text-xs text-muted-foreground">Selected for bulk</p>
            <p className="text-2xl font-bold text-foreground">{selectedPrefectIds.length}</p>
          </div>
          <div className="duty-card min-w-[170px] col-span-2 md:col-span-1">
            <p className="text-xs text-muted-foreground">Logged changes</p>
            <p className="text-2xl font-bold text-foreground">{pointLogs.length}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.7fr_1fr] gap-6">
        <div className="space-y-4">
          <div className="duty-card space-y-3">
            <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search prefects by name or reg no..."
                  className="pl-10 h-11 bg-muted/30 border-border/50"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox checked={allVisibleSelected} onCheckedChange={(checked) => toggleVisibleSelection(!!checked)} />
                Select visible
              </label>
            </div>
          </div>

          <div className="space-y-3">
            {standings.length === 0 && (
              <div className="duty-card text-center py-10 text-muted-foreground">
                No prefects match your search.
              </div>
            )}

            {standings.map((prefect, index) => {
              const points = pointsByPrefect[prefect.id] ?? 1000;
              const latestLog = latestLogByPrefectId.get(prefect.id);

              return (
                <div
                  key={prefect.id}
                  className="duty-card space-y-4"
                >
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={selectedPrefectIds.includes(prefect.id)}
                        onCheckedChange={(checked) => togglePrefectSelection(prefect.id, !!checked)}
                        className="mt-1"
                      />
                      <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                        #{index + 1}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-foreground">{prefect.name}</p>
                          <Badge variant="outline">G{prefect.grade}</Badge>
                          <Badge variant="outline">{prefect.regNo}</Badge>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="text-sm text-muted-foreground">{prefect.gender}</span>
                          {latestLog && (
                            <span className="text-xs text-muted-foreground">
                              Last change {formatDistanceToNow(new Date(latestLog.createdAt), { addSuffix: true })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-left lg:text-right">
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Points</p>
                      <p className="text-3xl font-bold text-foreground">{points}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-[110px_1fr_auto] gap-2">
                    <Input
                      type="number"
                      min={1}
                      value={singleAmountById[prefect.id] ?? '5'}
                      onChange={(event) => setSingleAmountById((current) => ({ ...current, [prefect.id]: event.target.value }))}
                      className="bg-muted/30"
                      placeholder="Points"
                    />
                    <Input
                      value={singleReasonById[prefect.id] ?? ''}
                      onChange={(event) => setSingleReasonById((current) => ({ ...current, [prefect.id]: event.target.value }))}
                      className="bg-muted/30"
                      placeholder="Reason for this point change..."
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => submitSingleChange(prefect.id, 'add')}>
                        <PlusCircle className="h-4 w-4 mr-1" /> Add
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => submitSingleChange(prefect.id, 'deduct')}>
                        <MinusCircle className="h-4 w-4 mr-1" /> Deduct
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div className="duty-card space-y-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-foreground">Bulk Update</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Select multiple prefects from the standings list, then add or deduct the same amount for all of them.
            </p>
            <Input
              type="number"
              min={1}
              value={bulkAmount}
              onChange={(event) => setBulkAmount(event.target.value)}
              className="bg-muted/30"
              placeholder="Point amount"
            />
            <Textarea
              value={bulkReason}
              onChange={(event) => setBulkReason(event.target.value)}
              className="min-h-28 bg-muted/30"
              placeholder="Reason for this bulk change..."
            />
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => submitBulkChange('add')}>
                <PlusCircle className="h-4 w-4 mr-1" /> Bulk Add
              </Button>
              <Button className="flex-1" variant="outline" onClick={() => submitBulkChange('deduct')}>
                <MinusCircle className="h-4 w-4 mr-1" /> Bulk Deduct
              </Button>
            </div>
          </div>

          <div className="duty-card space-y-4">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-foreground">Recent Logs</h3>
            </div>

            {recentLogs.length === 0 && (
              <p className="text-sm text-muted-foreground">No point changes yet.</p>
            )}

            <div className="space-y-3">
              {recentLogs.map((log) => {
                const prefect = prefectById.get(log.prefectId);
                if (!prefect) return null;

                return (
                  <div key={log.id} className="rounded-xl border border-border/40 bg-muted/10 p-3 space-y-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-sm text-foreground">{prefect.name}</p>
                        <p className="text-xs text-muted-foreground">{prefect.regNo}</p>
                      </div>
                      <Badge variant={log.amount >= 0 ? 'default' : 'destructive'}>
                        {log.amount >= 0 ? `+${log.amount}` : log.amount}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{log.reason}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="duty-card">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-foreground">Rules</h3>
            </div>
            <p className="text-sm text-muted-foreground">Base score is 1000 for every prefect. Every add or deduct action must include a reason, and each change is saved to the log.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
