using System.Net.Http.Headers;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;

namespace RobinCode;

/// <summary>
/// Direct calls to keyless public AI endpoints (Kilo AI Gateway, OVHcloud Kepler).
/// Zero Python, zero API keys, pure .NET runtime.
/// </summary>
public static class KeylessClient
{
    const string Kilo = "https://ai-gateway.kilo.ai/api/v1/chat/completions";
    const string Ovh = "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions";

    static readonly HttpClient Http = CreateClient();

    public readonly record struct Endpoint(string Id, string Model, string Url);

    public static readonly Endpoint[] Endpoints =
    [
        new("kilo", "kilo-auto/free", Kilo),
        new("ovh-120b", "gpt-oss-120b", Ovh),
        new("ovh-qwen", "Qwen3.8-27B", Ovh),
        new("kilo-cohere", "cohere/north-mini-code:free", Kilo),
        new("kilo-lightning", "nvidia/nemotron-3.5-lightning:free", Kilo),
        new("kilo-laguna", "poolside/laguna-xs-2.1:free", Kilo),
        new("kilo-nemotron", "nvidia/nemotron-3-super-120b-a12b:free", Kilo),
        new("ovh", "Qwen3.5-397B-A17B", Ovh),
    ];

    public static Endpoint Resolve(string modelId)
    {
        foreach (var endpoint in Endpoints)
        {
            if (string.Equals(endpoint.Id, modelId, StringComparison.OrdinalIgnoreCase))
                return endpoint;
        }
        return Endpoints[0]; // Default to Kilo auto
    }

    public static async Task<CompletionResult> CompleteAsync(
        string prompt, string modelId = "kilo", Action<string>? onChunk = null, CancellationToken cancel = default)
    {
        var started = Environment.TickCount64;
        var parts = new StringBuilder();
        try
        {
            await foreach (var piece in StreamAsync(prompt, modelId, cancel))
            {
                parts.Append(piece);
                onChunk?.Invoke(piece);
            }
            var text = parts.ToString().Trim();
            // Clean any residual think tags just in case
            text = System.Text.RegularExpressions.Regex.Replace(text, @"<think>[\s\S]*?</think>", "", System.Text.RegularExpressions.RegexOptions.IgnoreCase).Trim();
            var seconds = (Environment.TickCount64 - started) / 1000.0;
            if (text.Length == 0)
                return new CompletionResult(false, modelId, "", seconds, "Empty response from endpoint.");
            return new CompletionResult(true, modelId, text, seconds);
        }
        catch (ProviderFailure ex)
        {
            return new(false, modelId, "", (Environment.TickCount64 - started) / 1000.0, ex.Message,
                (int?)ex.StatusCode, ex.RetryAfterUtc, RateLimitIsProviderWide: ex.ProviderWide);
        }
        catch (OperationCanceledException) when (!cancel.IsCancellationRequested)
        {
            return new(false, modelId, "", (Environment.TickCount64 - started) / 1000.0, "The free service stopped making progress or took too long.");
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            var seconds = (Environment.TickCount64 - started) / 1000.0;
            return new CompletionResult(false, modelId, "", seconds, ex.Message);
        }
    }

    public static async IAsyncEnumerable<string> StreamAsync(
        string prompt,
        string modelId = "kilo",
        [EnumeratorCancellation] CancellationToken cancel = default)
    {
        using var total = CancellationTokenSource.CreateLinkedTokenSource(cancel);
        total.CancelAfter(TimeSpan.FromSeconds(90));
        var operation = total.Token;
        var endpoint = Resolve(modelId);
        using var request = new HttpRequestMessage(HttpMethod.Post, endpoint.Url);
        request.Headers.TryAddWithoutValidation("User-Agent", "RobinTHood/0.2");
        request.Content = new StringContent(Frame(endpoint.Model, prompt), Encoding.UTF8, "application/json");

        HttpResponseMessage response;
        try
        {
            using var connect = CancellationTokenSource.CreateLinkedTokenSource(operation);
            connect.CancelAfter(TimeSpan.FromSeconds(15));
            response = await Http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, connect.Token);
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception ex)
        {
            throw new HttpRequestException($"Connect to {endpoint.Id} failed: {ex.Message}");
        }

        using (response)
        {
            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync(operation);
                int code = (int)response.StatusCode;
                string hint = code switch
                {
                    429 => "rate limited by the provider",
                    401 or 403 => "provider refused the request (no key or blocked)",
                    >= 500 => "provider error",
                    _ => "request rejected",
                };
                DateTimeOffset? retry = response.Headers.RetryAfter?.Date;
                if (response.Headers.RetryAfter?.Delta is { } delta) retry = DateTimeOffset.UtcNow + delta;
                // Only a specific structured upstream-model refusal is model-scoped.
                // Unknown 429s stay provider-wide; don't evade a shared IP quota by
                // cycling through model names at the same gateway.
                bool providerWide = true;
                using (var errorFrame = ParseFrame(body))
                {
                    if (code == 429 && errorFrame is not null && errorFrame.RootElement.ValueKind == JsonValueKind.Object && errorFrame.RootElement.TryGetProperty("error", out var error)
                        && error.ValueKind == JsonValueKind.Object && error.TryGetProperty("metadata", out var metadata)
                        && metadata.ValueKind == JsonValueKind.Object && metadata.TryGetProperty("raw", out var raw)
                        && raw.ValueKind == JsonValueKind.String && raw.GetString() is { } detail
                        && detail.Contains(endpoint.Model, StringComparison.Ordinal)
                        && detail.Contains("temporarily rate-limited upstream", StringComparison.OrdinalIgnoreCase)) providerWide = false;
                }
                throw new ProviderFailure($"HTTP {code} from {endpoint.Id} - {hint}: {Trim(body)}", response.StatusCode, retry, providerWide);
            }

            await using var stream = await response.Content.ReadAsStreamAsync(operation);
            using var reader = new StreamReader(stream);
            bool inThink = false;
            var idle = System.Diagnostics.Stopwatch.StartNew();
            while (true)
            {
                using var read = CancellationTokenSource.CreateLinkedTokenSource(operation);
                double left = 30 - idle.Elapsed.TotalSeconds;
                if (left <= 0) throw new TimeoutException("The free service stopped producing text.");
                read.CancelAfter(TimeSpan.FromSeconds(left));
                var line = await reader.ReadLineAsync(read.Token);
                if (line is null) throw new IOException("The free service closed the response before confirming it was complete.");
                if (line.Trim().Equals("data: [DONE]", StringComparison.Ordinal)) yield break;
                bool finished = false;
                if (line.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
                {
                    string data = line[5..].Trim();
                    if (data.Length == 0) continue;
                    using var frame = ParseFrame(data);
                    if (frame is null) throw new IOException("The free service sent an invalid answer frame.");
                    if (frame is not null && frame.RootElement.TryGetProperty("error", out var error))
                    {
                        int code = 502;
                        if (error.ValueKind == JsonValueKind.Object)
                        {
                            foreach (string field in new[] { "code", "type" })
                            {
                                if (!error.TryGetProperty(field, out var value)) continue;
                                string label = value.ToString();
                                if (int.TryParse(label, out var parsed)) code = parsed;
                                if (label.Equals("rate_limit_exceeded", StringComparison.OrdinalIgnoreCase)
                                    || label.Equals("rate_limit_error", StringComparison.OrdinalIgnoreCase)
                                    || label.Equals("too_many_requests", StringComparison.OrdinalIgnoreCase)
                                    || code == 429)
                                {
                                    code = 429;
                                    break;
                                }
                            }
                        }
                        throw new ProviderFailure("The free service reported an error during its answer.", (System.Net.HttpStatusCode)code, null);
                    }
                    if (frame is not null && frame.RootElement.TryGetProperty("choices", out var choices) && choices.ValueKind == JsonValueKind.Array && choices.GetArrayLength() > 0 && choices[0].TryGetProperty("finish_reason", out var reason) && reason.ValueKind == JsonValueKind.String)
                    {
                        string? why = reason.GetString();
                        if (why is "length" or "error" or "content_filter") throw new IOException("The free service cut the answer short (" + why + ").");
                        finished = why is "stop" or "end_turn";
                    }
                }
                if (finished && !TryDelta(line, out _)) yield break;
                if (!TryDelta(line, out var text)) continue;
                if (text.Length == 0) continue;
                idle.Restart();

                // Filter out any reasoning/thinking tokens (<think>...</think>)
                if (inThink)
                {
                    int endIdx = text.IndexOf("</think>", StringComparison.OrdinalIgnoreCase);
                    if (endIdx >= 0)
                    {
                        inThink = false;
                        text = text[(endIdx + 8)..];
                        if (text.Length == 0) continue;
                    }
                    else
                    {
                        continue;
                    }
                }
                else if (text.Contains("<think>", StringComparison.OrdinalIgnoreCase))
                {
                    int startIdx = text.IndexOf("<think>", StringComparison.OrdinalIgnoreCase);
                    var before = text[..startIdx];
                    int endIdx = text.IndexOf("</think>", StringComparison.OrdinalIgnoreCase);
                    if (endIdx >= 0)
                    {
                        text = before + text[(endIdx + 8)..];
                        if (text.Length == 0) continue;
                    }
                    else
                    {
                        inThink = true;
                        if (before.Length > 0) yield return before;
                        continue;
                    }
                }

                yield return text;
                if (finished) yield break;
            }
        }
    }

    public static string Frame(string model, string prompt)
    {
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream))
        {
            writer.WriteStartObject();
            writer.WriteString("model", model);
            writer.WriteBoolean("stream", true);
            writer.WriteStartArray("messages");
            writer.WriteStartObject();
            writer.WriteString("role", "user");
            writer.WriteString("content", prompt);
            writer.WriteEndObject();
            writer.WriteEndArray();
            writer.WriteEndObject();
        }
        return Encoding.UTF8.GetString(stream.ToArray());
    }

    public static bool TryDelta(string line, out string text)
    {
        text = "";
        if (string.IsNullOrWhiteSpace(line) || line.StartsWith(':')) return false;
        const string prefix = "data:";
        if (!line.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) return false;

        var payload = line[prefix.Length..].Trim();
        if (payload == "[DONE]") return false;

        try
        {
            using var doc = JsonDocument.Parse(payload);
            if (doc.RootElement.ValueKind != JsonValueKind.Object) return false;

            if (!doc.RootElement.TryGetProperty("choices", out var choices)
                || choices.ValueKind != JsonValueKind.Array
                || choices.GetArrayLength() == 0)
                return false;

            var choice = choices[0];
            if (choice.TryGetProperty("delta", out var delta))
            {
                // Content only - drop reasoning/thinking stream so users only see clean code
                if (delta.TryGetProperty("content", out var content)
                    && content.ValueKind == JsonValueKind.String
                    && !string.IsNullOrEmpty(content.GetString()))
                {
                    text = content.GetString()!;
                    return true;
                }
            }
        }
        catch
        {
            // Ignore incomplete frames in stream
        }

        return false;
    }

    static HttpClient CreateClient()
    {
        var client = new HttpClient { Timeout = Timeout.InfiniteTimeSpan };
        client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("text/event-stream"));
        return client;
    }

    static JsonDocument? ParseFrame(string text)
    {
        try { return JsonDocument.Parse(text); }
        catch (JsonException) { return null; }
    }

    sealed class ProviderFailure(string message, System.Net.HttpStatusCode status, DateTimeOffset? retry, bool providerWide = true)
        : HttpRequestException(message, null, status)
    {
        public DateTimeOffset? RetryAfterUtc { get; } = retry;
        public bool ProviderWide { get; } = providerWide;
    }

    static string Trim(string body)
    {
        body = body.Replace('\r', ' ').Replace('\n', ' ').Trim();
        return body.Length <= 180 ? body : body[..180];
    }
}
