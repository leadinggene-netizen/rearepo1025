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
            JsonSerializer.Serialize(stream, value, json);
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
            var next = JsonSerializer.Deserialize<BridgeState>(JsonSerializer.Serialize(state, json), json)!;
            var result = change(next);
            Save(next);
            state = next;
            return result;
        }
    }

    public void Dispose() => lease.Dispose();
}
