using System.Text.Json;

namespace BridgeDemo;

public sealed class StateStore : IDisposable
{
    readonly object gate = new();
    readonly FileStream lease;
    readonly string path;
    readonly JsonSerializerOptions json = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    BridgeState state;

    public StateStore(string directory)
    {
        Directory.CreateDirectory(directory);
        lease = new FileStream(Path.Combine(directory, "server.lock"), FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
        path = Path.Combine(directory, "state.json");
        state = File.Exists(path)
            ? JsonSerializer.Deserialize<BridgeState>(File.ReadAllText(path), json) ?? throw new InvalidDataException("Empty state")
            : new BridgeState();
        // A persisted heartbeat is not evidence that a terminal is connected after restart.
        state.Connection = DurableConnection(state.Connection);
        // Never redeliver a possibly executed command after a crash.
        foreach (var signal in state.Signals.Where(s => s.Status == "dispatched"))
        {
            signal.Status = "unknown";
            signal.Detail = "Server restarted after dispatch; inspect MT5 before submitting a new command.";
        }
        Save(state);
    }

    void Save(BridgeState value)
    {
        using (var stream = new FileStream(path + ".tmp", FileMode.Create, FileAccess.Write, FileShare.None))
        {
            JsonSerializer.Serialize(stream, new BridgeState {
                AdminKey = value.AdminKey, Connection = DurableConnection(value.Connection), Signals = value.Signals
            }, json);
            stream.Flush(true);
        }
        File.Move(path + ".tmp", path, true);
    }

    public T Read<T>(Func<BridgeState, T> read)
    {
        lock (gate) return read(state);
    }

    public T Change<T>(Func<BridgeState, T> change)
    {
        lock (gate)
        {
            // Commit to disk before exposing the changed state or delivering a command.
            var next = new BridgeState {
                AdminKey = state.AdminKey, Connection = state.Connection with { },
                Signals = state.Signals.Select(s => s with { }).ToList()
            };
            var result = change(next);
            if (next.AdminKey != state.AdminKey ||
                DurableConnection(next.Connection) != DurableConnection(state.Connection) ||
                !next.Signals.SequenceEqual(state.Signals)) Save(next);
            state = next;
            return result;
        }
    }

    static Connection DurableConnection(Connection value) => value with {
        LastSeen = null, Balance = 0, Equity = 0, Positions = 0
    };

    public void Dispose() => lease.Dispose();
}
