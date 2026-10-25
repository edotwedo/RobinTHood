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
        var endpoint = Resolve(modelId);
        using var request = new HttpRequestMessage(HttpMethod.Post, endpoint.Url);
        request.Headers.TryAddWithoutValidation("User-Agent", "RobinTHood/0.2");
        request.Content = new StringContent(Frame(endpoint.Model, prompt), Encoding.UTF8, "application/json");

        HttpResponseMessage response;
        try
        {
            response = await Http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancel);
        }
        catch (Exception ex)
        {
            throw new HttpRequestException($"Connect to {endpoint.Id} failed: {ex.Message}");
        }

        using (response)
        {
            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync(cancel);
                int code = (int)response.StatusCode;
                string hint = code switch
                {
                    429 => "rate limited by the provider",
                    401 or 403 => "provider refused the request (no key or blocked)",
                    >= 500 => "provider error",
                    _ => "request rejected",
                };
                throw new HttpRequestException($"HTTP {code} from {endpoint.Id} - {hint}: {Trim(body)}");
            }

            await using var stream = await response.Content.ReadAsStreamAsync(cancel);
            using var reader = new StreamReader(stream);
            bool inThink = false;
            while (true)
            {
                var line = await reader.ReadLineAsync(cancel);
                if (line is null) yield break;
                if (!TryDelta(line, out var text)) continue;
                if (text.Length == 0) continue;

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
        var client = new HttpClient { Timeout = TimeSpan.FromSeconds(25) };
        client.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("text/event-stream"));
        return client;
    }

    static string Trim(string body)
    {
        body = body.Replace('\r', ' ').Replace('\n', ' ').Trim();
        return body.Length <= 180 ? body : body[..180];
    }
}
