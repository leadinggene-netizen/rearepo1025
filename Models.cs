using System.Text.Json.Serialization;

namespace BridgeDemo;

public sealed class BridgeState
{
    public string AdminKey { get; set; } = Guid.NewGuid().ToString("N");
    public Connection Connection { get; set; } = new();
    public List<Signal> Signals { get; set; } = [];
    public ExecutionPolicy Policy { get; set; } = new();
    [JsonIgnore] public List<Receipt> PendingReceipts { get; set; } = [];
    [JsonIgnore] public List<AuditEvent> PendingEvents { get; set; } = [];
}

public sealed record Connection
{
    public string Id { get; set; } = "demo-mt5";
    public string WebhookKey { get; set; } = Guid.NewGuid().ToString("N");
    public string TerminalKey { get; set; } = Guid.NewGuid().ToString("N");
    public string? Account { get; set; }
    public string? Broker { get; set; }
    public DateTimeOffset? LastSeen { get; set; }
    public double Balance { get; set; }
    public double Equity { get; set; }
    public int Positions { get; set; }
}

public sealed record Signal
{
    public string Id { get; set; } = "";
    public string Action { get; set; } = "";
    public string Symbol { get; set; } = "";
    public double Lots { get; set; }
    public double SlPoints { get; set; }
    public double TpPoints { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset ExpiresAt { get; set; } = DateTimeOffset.UtcNow.AddSeconds(30);
    public DateTimeOffset? SentAt { get; set; }
    public DateTimeOffset? DispatchedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public string Status { get; set; } = "queued";
    public string? Ticket { get; set; }
    public string? Detail { get; set; }
}

public sealed record AlertRequest(string Id, string Action, string Symbol, double Lots = 0.01,
    double SlPoints = 0, double TpPoints = 0, string? Secret = null, DateTimeOffset? SentAt = null);
public sealed record ResultRequest(string Id, string Status, string Ticket, string Detail);

public sealed record ExecutionPolicy
{
    public bool Paused { get; set; } = true;
    public string[] AllowedSymbols { get; set; } = [];
    public double MaxLots { get; set; } = 0.10;
    public int MaxAgeSeconds { get; set; } = 30;
}
public sealed record Receipt(string Id, DateTimeOffset ReceivedAt, string? EventId,
    string Disposition, string Detail, object? Payload);
public sealed record AuditEvent(string Id, DateTimeOffset CreatedAt, string Kind, string Detail, string? EventId = null);
public sealed class StoreBusyException : Exception { }
