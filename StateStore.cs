using System.Text.Json;
using Microsoft.Data.Sqlite;

namespace BridgeDemo;

public sealed class StateStore : IDisposable
{
    readonly object gate = new();
    readonly FileStream lease;
    readonly SqliteConnection db;
    readonly string directory;
    readonly JsonSerializerOptions json = new(JsonSerializerDefaults.Web);
    BridgeState state;
    bool faulted;

    public StateStore(string directory)
    {
        this.directory = Path.GetFullPath(directory);
        Directory.CreateDirectory(this.directory);
        lease = new FileStream(Path.Combine(this.directory, "server.lock"), FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
        db = new SqliteConnection(new SqliteConnectionStringBuilder {
            DataSource = Path.Combine(this.directory, "bridge.db"), DefaultTimeout = 1, Pooling = false
        }.ToString());
        try
        {
            db.Open();
            Execute("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;");
            var version = Convert.ToInt32(Scalar("PRAGMA user_version"));
            if (version is not (0 or 1)) throw new InvalidDataException("Unsupported database schema; refusing migration.");
            Execute("""
                CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY CHECK(id=1), document TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS commands(sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
                    status TEXT NOT NULL, document TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS commands_status ON commands(status,sequence);
                CREATE TABLE IF NOT EXISTS receipts(sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
                    event_id TEXT, disposition TEXT NOT NULL, document TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS receipts_event ON receipts(event_id);
                CREATE TABLE IF NOT EXISTS audit(sequence INTEGER PRIMARY KEY AUTOINCREMENT, document TEXT NOT NULL);
                """);
            if (Scalar("SELECT document FROM settings WHERE id=1") is not string metadata)
            {
                if (version != 0 || Convert.ToInt64(Scalar("SELECT count(*) FROM commands")) != 0)
                    throw new InvalidDataException("Database settings are missing; refusing to reset credentials or history.");
                var legacy = Path.Combine(this.directory, "state.json");
                state = File.Exists(legacy)
                    ? JsonSerializer.Deserialize<BridgeState>(File.ReadAllText(legacy), json) ?? throw new InvalidDataException("Empty legacy state")
                    : new BridgeState();
                state.Policy = new ExecutionPolicy();
                if (state.AdminKey.Length < 20 || state.Connection.TerminalKey.Length < 20 || state.Connection.WebhookKey.Length < 20 || state.Signals.Select(x => x.Id).Distinct().Count() != state.Signals.Count)
                    throw new InvalidDataException("Legacy credentials or event identity are invalid; refusing migration.");
                state.Connection = DurableConnection(state.Connection);
                foreach (var signal in state.Signals)
                {
                    signal.ExpiresAt = signal.CreatedAt.AddSeconds(30);
                    if (signal.Status == "queued") { signal.Status = "expired"; signal.Detail = "Legacy queue expired during migration; no historical replay."; }
                    if (signal.Status == "dispatched") { signal.Status = "unknown"; signal.Detail = "Migration after dispatch; inspect MT5."; }
                }
                using var tx = db.BeginTransaction();
                Execute("INSERT INTO settings VALUES(1,$document)", tx, ("$document", Metadata(state)));
                foreach (var signal in state.Signals) WriteSignal(signal, tx);
                Execute("PRAGMA user_version=1", tx);
                tx.Commit();
            }
            else state = JsonSerializer.Deserialize<BridgeState>(metadata, json) ?? throw new InvalidDataException("Empty database settings");
            state.Connection = DurableConnection(state.Connection);
            state.Signals = QueryDocuments<Signal>("""
                SELECT document FROM commands WHERE status IN ('queued','dispatched','unknown')
                OR sequence IN (SELECT sequence FROM commands ORDER BY sequence DESC LIMIT 200) ORDER BY sequence
                """);
            Change(s => {
                foreach (var signal in s.Signals.Where(x => x.Status == "dispatched"))
                { signal.Status = "unknown"; signal.Detail = "Server restarted after dispatch; inspect MT5 before continuing."; }
                s.PendingEvents.Add(Event("server_started", "Server started; persisted heartbeats cleared. Unknown execution is never redelivered."));
                return true;
            });
        }
        catch { db.Dispose(); lease.Dispose(); throw; }
    }

    public static AuditEvent Event(string kind, string detail, string? id = null) => new(Guid.NewGuid().ToString("N"), DateTimeOffset.UtcNow, kind, detail, id);
    static Connection DurableConnection(Connection c) => c with { LastSeen = null, Balance = 0, Equity = 0, Positions = 0 };
    string Metadata(BridgeState s) => JsonSerializer.Serialize(new { s.AdminKey, Connection = DurableConnection(s.Connection), s.Policy }, json);
    SqliteCommand Command(string sql, SqliteTransaction? tx = null, params (string, object?)[] parameters)
    {
        var command = db.CreateCommand(); command.CommandText = sql; command.Transaction = tx;
        foreach (var (name, value) in parameters) command.Parameters.AddWithValue(name, value ?? DBNull.Value);
        return command;
    }
    void Execute(string sql, SqliteTransaction? tx = null, params (string, object?)[] parameters)
    { using var command = Command(sql, tx, parameters); command.ExecuteNonQuery(); }
    object? Scalar(string sql, params (string, object?)[] parameters)
    { using var command = Command(sql, null, parameters); return command.ExecuteScalar(); }
    List<T> QueryDocuments<T>(string sql)
    {
        using var command = Command(sql); using var rows = command.ExecuteReader(); var list = new List<T>();
        while (rows.Read()) list.Add(JsonSerializer.Deserialize<T>(rows.GetString(0), json) ?? throw new InvalidDataException("Invalid database document"));
        return list;
    }
    void WriteSignal(Signal s, SqliteTransaction tx) => Execute("""
        INSERT INTO commands(id,status,document) VALUES($id,$status,$document)
        ON CONFLICT(id) DO UPDATE SET status=excluded.status,document=excluded.document
        """, tx, ("$id", s.Id), ("$status", s.Status), ("$document", JsonSerializer.Serialize(s, json)));

    public T Read<T>(Func<BridgeState, T> read)
    {
        if (!Monitor.TryEnter(gate, 100)) throw new StoreBusyException();
        try
        {
            if (faulted) throw new InvalidDataException("Storage failed; restart after diagnosing the database before further delivery.");
            return read(state);
        }
        finally { Monitor.Exit(gate); }
    }
    public Signal? FindSignal(string id) => Read(s => {
        var cached = s.Signals.Find(x => x.Id == id);
        if (cached is not null) return cached with { };
        return Scalar("SELECT document FROM commands WHERE id=$id", ("$id", id)) is string text ? JsonSerializer.Deserialize<Signal>(text, json) : null;
    });
    public object History() => Read(_ => new {
        receipts = QueryDocuments<Receipt>("SELECT document FROM receipts ORDER BY sequence DESC LIMIT 100"),
        events = QueryDocuments<AuditEvent>("SELECT document FROM audit ORDER BY sequence DESC LIMIT 100")
    });
    public bool Healthy() => Read(_ => Convert.ToInt32(Scalar("SELECT 1")) == 1);
    public bool CheckIntegrity() => Read(_ => Scalar("PRAGMA integrity_check") as string == "ok");

    public T Change<T>(Func<BridgeState, T> change)
    {
        if (!Monitor.TryEnter(gate, 100)) throw new StoreBusyException();
        try
        {
            if (faulted) throw new InvalidDataException("Storage failed; refusing delivery from potentially stale memory.");
            var next = new BridgeState { AdminKey = state.AdminKey, Connection = state.Connection with { },
                Policy = state.Policy with { AllowedSymbols = state.Policy.AllowedSymbols.ToArray() },
                Signals = state.Signals.Select(x => x with { }).ToList() };
            var result = change(next);
            var metadata = Metadata(next);
            var metadataChanged = metadata != Metadata(state);
            var before = state.Signals.ToDictionary(x => x.Id);
            var changed = next.Signals.Where(x => !before.TryGetValue(x.Id, out var previous) || previous != x).ToArray();
            if (metadataChanged || changed.Length > 0 || next.PendingReceipts.Count > 0 || next.PendingEvents.Count > 0)
            {
                using var tx = db.BeginTransaction();
                if (metadataChanged) Execute("UPDATE settings SET document=$document WHERE id=1", tx, ("$document", metadata));
                foreach (var signal in changed) WriteSignal(signal, tx);
                foreach (var receipt in next.PendingReceipts)
                    Execute("INSERT INTO receipts(id,event_id,disposition,document) VALUES($id,$event,$disposition,$document)", tx,
                        ("$id", receipt.Id), ("$event", receipt.EventId), ("$disposition", receipt.Disposition), ("$document", JsonSerializer.Serialize(receipt, json)));
                foreach (var entry in next.PendingEvents) Execute("INSERT INTO audit(document) VALUES($document)", tx, ("$document", JsonSerializer.Serialize(entry, json)));
                tx.Commit();
            }
            next.PendingReceipts.Clear(); next.PendingEvents.Clear();
            var recent = next.Signals.TakeLast(200).Select(x => x.Id).ToHashSet();
            next.Signals = next.Signals.Where(x => recent.Contains(x.Id) || x.Status is "queued" or "dispatched" or "unknown").ToList();
            state = next;
            return result;
        }
        catch (SqliteException e) when (e.SqliteErrorCode is 10 or 11 or 13 or 26)
        {
            faulted = true;
            throw;
        }
        finally { Monitor.Exit(gate); }
    }

    public object Backup() => Read(_ => {
        var backups = Path.Combine(directory, "backups"); Directory.CreateDirectory(backups);
        var file = "relay-" + DateTime.UtcNow.ToString("yyyyMMdd-HHmmss") + "-" + Guid.NewGuid().ToString("N") + ".db";
        using var target = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = Path.Combine(backups, file), Pooling = false }.ToString());
        target.Open(); db.BackupDatabase(target);
        using var check = target.CreateCommand(); check.CommandText = "PRAGMA integrity_check";
        if (check.ExecuteScalar() as string != "ok") throw new InvalidDataException("Backup integrity check failed");
        return new { file, integrity = "ok" };
    });
    public void Dispose() { db.Dispose(); lease.Dispose(); }
}
