using Microsoft.AspNetCore.SignalR;
using Microsoft.Data.Sqlite;

namespace BridgeDemo;

public sealed class BridgeMaintenance(StateStore store, IHubContext<PortalHub> hub, ILogger<BridgeMaintenance> logger) : BackgroundService
{
    int dirty;
    bool wasOnline;
    public void Notify() => Interlocked.Exchange(ref dirty, 1);
    public static bool Sweep(BridgeState s)
    {
        var changed = false;
        var now = DateTimeOffset.UtcNow;
        foreach (var signal in s.Signals.Where(x => x.Status == "queued" && x.ExpiresAt <= now))
        {
            signal.Status = "expired"; signal.Detail = "Command expired before dispatch; no execution requested.";
            s.PendingEvents.Add(StateStore.Event("expired", signal.Detail, signal.Id)); changed = true;
        }
        foreach (var signal in s.Signals.Where(x => x.Status == "dispatched" && x.DispatchedAt < now.AddSeconds(-30)))
        {
            signal.Status = "unknown"; signal.Detail = "Result overdue; inspect MT5. Never retry automatically.";
            s.PendingEvents.Add(StateStore.Event("unknown", signal.Detail, signal.Id)); changed = true;
        }
        return changed;
    }
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(1));
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                try
                {
                    var online = store.Read(s => s.Connection.LastSeen > DateTimeOffset.UtcNow.AddSeconds(-10));
                    var changed = store.Change(s => {
                        var swept = Sweep(s);
                        if (wasOnline && !online) s.PendingEvents.Add(StateStore.Event("terminal_offline", "MT5 heartbeat lost; pending commands keep their original expiry."));
                        return swept;
                    });
                    changed |= online != wasOnline; wasOnline = online;
                    if (Interlocked.Exchange(ref dirty, 0) == 1 || changed)
                    {
                        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
                        timeout.CancelAfter(TimeSpan.FromSeconds(2));
                        await hub.Clients.All.SendAsync("changed", timeout.Token);
                    }
                }
                catch (Exception e) when (e is SqliteException or IOException or StoreBusyException or OperationCanceledException)
                { logger.LogWarning("Database maintenance or portal notification could not complete; it will be retried."); }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
    }
}
