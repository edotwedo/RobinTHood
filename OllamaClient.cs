using System.Diagnostics;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace RobinCode;

public static class OllamaClient
{
    const string BaseUrl = "http://127.0.0.1:11434";
    static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(60) };

    public static async Task<List<string>> GetInstalledModelsAsync()
    {
        try
        {
            using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(1500));
            using var resp = await Http.GetAsync($"{BaseUrl}/api/tags", cts.Token);
            if (!resp.IsSuccessStatusCode) return [];

            var json = await resp.Content.ReadAsStringAsync(cts.Token);
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.TryGetProperty("models", out var modelsElem) && modelsElem.ValueKind == JsonValueKind.Array)
            {
                var list = new List<string>();
                foreach (var m in modelsElem.EnumerateArray())
                {
                    if (m.TryGetProperty("name", out var nameProp))
                    {
                        var name = nameProp.GetString();
                        if (!string.IsNullOrWhiteSpace(name))
                            list.Add(name);
                    }
                }
                return list;
            }
        }
        catch
        {
            // Ollama offline or not installed
        }
        return [];
    }

    public static async Task<CompletionResult> GenerateAsync(string model, string prompt, CancellationToken cancel = default)
    {
        var sw = Stopwatch.StartNew();
        try
        {
            var reqObj = new
            {
                model,
                prompt,
                stream = false
            };
            var content = new StringContent(JsonSerializer.Serialize(reqObj), Encoding.UTF8, "application/json");
            using var resp = await Http.PostAsync($"{BaseUrl}/api/generate", content, cancel);
            if (!resp.IsSuccessStatusCode)
            {
                sw.Stop();
                return new CompletionResult(false, model, "", sw.Elapsed.TotalSeconds, $"Ollama HTTP {(int)resp.StatusCode}");
            }

            var resJson = await resp.Content.ReadAsStringAsync(cancel);
            using var doc = JsonDocument.Parse(resJson);
            if (doc.RootElement.TryGetProperty("response", out var textProp))
            {
                sw.Stop();
                var text = textProp.GetString() ?? "";
                return new CompletionResult(true, $"local:{model}", text.Trim(), sw.Elapsed.TotalSeconds);
            }
            sw.Stop();
            return new CompletionResult(false, model, "", sw.Elapsed.TotalSeconds, "Invalid Ollama response payload.");
        }
        catch (Exception ex)
        {
            sw.Stop();
            return new CompletionResult(false, model, "", sw.Elapsed.TotalSeconds, ex.Message);
        }
    }
}
