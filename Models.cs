namespace BridgeDemo;

public sealed class BridgeState
{
    public string AdminKey { get; set; } = Guid.NewGuid().ToString("N");
    public Connection Connection { get; set; } = new();
    public List<Signal> Signals { get; set; } = [];
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
    public DateTimeOffset? DispatchedAt { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public string Status { get; set; } = "queued";
    public string? Ticket { get; set; }
    public string? Detail { get; set; }
}

public sealed record AlertRequest(string Id, string Action, string Symbol, double Lots = 0.01,
    double SlPoints = 0, double TpPoints = 0, string? Secret = null);
public sealed record ResultRequest(string Id, string Status, string Ticket, string Detail);
