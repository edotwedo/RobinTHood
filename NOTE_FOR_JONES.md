# NOTE FOR JONES — KeylessClient Fixes

Hey Jones! Here is the exact fix Phil asked for in RobinTHood (`KeylessClient.cs`).

### 1. In `robincode\KeylessClient.cs` -> `CreateClient()` (around line 200)
Add a User-Agent header (without this, Cloudflare edge gateways block requests with 403 Forbidden):
```csharp
static HttpClient CreateClient()
{
    var client = new HttpClient { Timeout = Timeout.InfiniteTimeSpan };
    client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("text/event-stream"));
    client.DefaultRequestHeaders.UserAgent.ParseAdd("RobinTHood-Desktop/0.2 (Windows)");
    return client;
}
```

### 2. In `robincode\KeylessClient.cs` -> `StreamResponseAsync` (around line 107)
Add a single 1-second micro-retry for 502/503 errors (these are momentary server blips; retrying once prevents throwing the provider into a long cascade cooldown):
```csharp
if ((response.StatusCode == System.Net.HttpStatusCode.ServiceUnavailable || 
     response.StatusCode == System.Net.HttpStatusCode.BadGateway) && !isRetry)
{
    await Task.Delay(1200, cancel);
    // retry request once with isRetry = true
}
```

### 3. Idle timeout buffer
Allow up to 45 seconds for the *first* token chunk on 120B models before timing out.

### Verification:
Run:
`dotnet run --project tests/WorkspaceChecks/WorkspaceChecks.csproj`
All 28 tests should pass!
