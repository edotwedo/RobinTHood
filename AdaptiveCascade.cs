using System.Diagnostics;

namespace RobinCode;

/// <summary>Shared cooldowns and bounded concurrency; never interprets more model
/// names at one host as independent quota pools.</summary>
internal sealed class AdaptiveCascade
{
    readonly KeylessClient.Endpoint[] endpoints;
    readonly Func<string, string, CancellationToken, Task<CompletionResult>> send;
    readonly Func<DateTimeOffset> now;
    readonly SemaphoreSlim slots = new(2, 2);
    readonly object sync = new();
    readonly Dictionary<string, DateTimeOffset> hostCooldown = [];
    readonly Dictionary<string, DateTimeOffset> modelCooldown = [];
    readonly Dictionary<string, Queue<DateTimeOffset>> starts = [];
    readonly Dictionary<string, int> active = [];
    int next;

    public AdaptiveCascade(KeylessClient.Endpoint[] endpoints,
        Func<string, string, CancellationToken, Task<CompletionResult>> send,
        Func<DateTimeOffset>? clock = null)
    {
        if (endpoints.Length == 0) throw new ArgumentException("At least one route is required.", nameof(endpoints));
        this.endpoints = endpoints;
        this.send = send;
        now = clock ?? (() => DateTimeOffset.UtcNow);
    }

    string Host(KeylessClient.Endpoint endpoint) => new Uri(endpoint.Url).Host;
    DateTimeOffset AvailableAt(KeylessClient.Endpoint endpoint)
    {
        string host = Host(endpoint);
        DateTimeOffset until = modelCooldown.GetValueOrDefault(endpoint.Id);
        if (hostCooldown.GetValueOrDefault(host) > until) until = hostCooldown[host];
        if (host.Equals("ai-gateway.kilo.ai", StringComparison.OrdinalIgnoreCase) && starts.TryGetValue(host, out var queue))
        {
            while (queue.Count > 0 && queue.Peek() <= now().AddHours(-1)) queue.Dequeue();
            if (queue.Count >= 200 && queue.Peek().AddHours(1) > until) until = queue.Peek().AddHours(1);
        }
        return until;
    }

    public async Task<CompletionResult> RunAsync(string prompt, CancellationToken cancel, Action<string>? status = null)
    {
        var watch = Stopwatch.StartNew();
        var tried = new HashSet<string>();
        var failures = new List<string>();
        // Rotate the first four established routes; newly verified routes are backups.
        int offset = (int)(((uint)Interlocked.Increment(ref next) - 1u) % (uint)Math.Min(4, endpoints.Length));
        var order = Enumerable.Range(0, Math.Min(4, endpoints.Length)).Select(i => endpoints[(i + offset) % Math.Min(4, endpoints.Length)])
            .Concat(endpoints[Math.Min(4, endpoints.Length)..]).ToArray();
        while (tried.Count < endpoints.Length)
        {
            cancel.ThrowIfCancellationRequested();
            await slots.WaitAsync(cancel);
            KeylessClient.Endpoint? selected = null;
            try
            {
                lock (sync)
                {
                    selected = order.Where(e => !tried.Contains(e.Id) && AvailableAt(e) <= now())
                        .OrderBy(e => active.GetValueOrDefault(Host(e)))
                        .Cast<KeylessClient.Endpoint?>().FirstOrDefault();
                    if (selected is { } endpoint)
                    {
                        string host = Host(endpoint);
                        active[host] = active.GetValueOrDefault(host) + 1;
                        if (!starts.TryGetValue(host, out var queue)) starts[host] = queue = new();
                        // Only Kilo has a documented local proactive hourly budget here.
                        if (host == "ai-gateway.kilo.ai") queue.Enqueue(now());
                        tried.Add(endpoint.Id);
                    }
                }
                if (selected is not { } target) break;
                status?.Invoke(failures.Count == 0 ? "Robin is working on your request…" : "Still working on your request…");
                CompletionResult result;
                try { result = await send(prompt, target.Id, cancel); }
                catch (OperationCanceledException) when (cancel.IsCancellationRequested) { throw; }
                catch (Exception ex) { result = new(false, target.Id, "", watch.Elapsed.TotalSeconds, ex.Message); }
                if (result.Success && !string.IsNullOrWhiteSpace(result.OutputText))
                    return result with { ModelUsed = $"Auto ({target.Id})", ElapsedSeconds = watch.Elapsed.TotalSeconds };
                failures.Add($"{target.Id}: {result.ErrorMessage}");
                lock (sync)
                {
                    string host = Host(target);
                    DateTimeOffset until;
                    if (result.HttpStatus == 429)
                    {
                        until = result.RetryAfterUtc is { } retry && retry > now() ? retry : now().AddSeconds(60);
                        if (!result.RateLimitIsProviderWide) modelCooldown[target.Id] = until;
                        else if (until > hostCooldown.GetValueOrDefault(host)) hostCooldown[host] = until;
                    }
                    else if (result.HttpStatus is 401 or 403 or 402)
                    {
                        until = now().AddMinutes(5);
                        if (until > hostCooldown.GetValueOrDefault(host)) hostCooldown[host] = until;
                    }
                    else modelCooldown[target.Id] = now().AddSeconds(result.HttpStatus == 404 ? 600 : 20);
                }
            }
            finally
            {
                if (selected is { } target) lock (sync) active[Host(target)]--;
                slots.Release();
            }
        }
        DateTimeOffset? ready;
        lock (sync)
        {
            var future = endpoints.Select(AvailableAt).Where(t => t > now()).ToArray();
            ready = future.Length == 0 ? null : future.Min();
        }
        string message = ready is { } retryAt
            ? $"Robin needs a short pause. Try again in {Math.Max(1, (int)Math.Ceiling((retryAt - now()).TotalSeconds))} seconds. Your request is still saved."
            : "Robin couldn't finish this request. Your request is still saved; please try again.";
        return new(false, "offline", "", watch.Elapsed.TotalSeconds, message, RetryAfterUtc: ready, Diagnostics: string.Join(" | ", failures));
    }
}
