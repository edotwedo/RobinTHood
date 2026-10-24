using System.Diagnostics;
using System.Text.RegularExpressions;

namespace RobinCode;

public record FreeModelInfo(string Id, string Name, string Provider, string Speed, bool Keyless);

public record CompletionResult(
    bool Success,
    string ModelUsed,
    string OutputText,
    double ElapsedSeconds,
    string ErrorMessage = ""
);

public static class FreeAggregator
{
    public static readonly List<FreeModelInfo> BaseModels =
    [
        new("auto", "⚡ Auto-Cascade (Fastest $0)", "Multi-Engine", "<1.0s", true),
        new("kilo", "Kilo Auto Free (Keyless Direct)", "Kilo Gateway", "0.9s", true),
        new("ovh-120b", "Llama 3 120B (Keyless Direct)", "OVHcloud", "1.4s", true),
        new("ovh-qwen", "Qwen 2.5 72B (Keyless Direct)", "OVHcloud", "1.2s", true),
        new("kilo-cohere", "Cohere Command-R (Keyless)", "Kilo", "1.5s", true),
        new("groq", "Llama 3.3 70B Turbo", "Groq LPU", "0.4s", false),
        new("cloudflare", "Llama 3.3 70B Fast", "Cloudflare", "0.9s", false),
        new("gemini-api", "Gemini 3.5 Flash Lite", "Google Free", "0.6s", false),
        new("nvidia-lightning", "Nemotron 3.5 Lightning", "NVIDIA", "0.8s", false),
    ];

    public static List<FreeModelInfo> CurrentModels { get; private set; } = new(BaseModels);

    public static async Task RefreshLocalModelsAsync()
    {
        var localList = await OllamaClient.GetInstalledModelsAsync();
        var combined = new List<FreeModelInfo>(BaseModels);

        if (localList.Count > 0)
        {
            int insertIdx = 1;
            foreach (var local in localList)
            {
                string tag = local.ToLowerInvariant();
                string speed = tag.Contains("7b") ? "GTX 1660 / ~3s" : "Instant / <1s";
                combined.Insert(insertIdx++, new($"ollama:{local}", $"💻 Local {local} (Air-Gapped)", "Local Ollama", speed, true));
            }
        }

        CurrentModels = combined;
    }

    public static Task<CompletionResult> RunPromptAsync(string prompt, string modelId = "auto") =>
        RunPromptStreamAsync(prompt, modelId, null);

    public static async Task<CompletionResult> RunPromptStreamAsync(
        string prompt, string modelId = "auto", Action<string>? onChunk = null, CancellationToken cancel = default)
    {
        var sw = Stopwatch.StartNew();

        // 0. Local Ollama Execution (Air-Gapped & Offline)
        if (modelId.StartsWith("ollama:"))
        {
            string localModel = modelId["ollama:".Length..];
            var res = await OllamaClient.GenerateAsync(localModel, prompt, cancel);
            if (res.Success && !string.IsNullOrEmpty(res.OutputText))
                onChunk?.Invoke(res.OutputText);
            return res;
        }

        // 1. Direct Native Keyless Execution (Fastest & Zero Runtime Dependencies)
        // Auto tries Kilo first (fastest, <1s), then falls over to OVH
        if (modelId == "auto")
        {
            string[] cascadeOrder = ["kilo", "ovh-120b", "ovh-qwen", "kilo-cohere"];
            foreach (var target in cascadeOrder)
            {
                try
                {
                    using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancel);
                    cts.CancelAfter(TimeSpan.FromSeconds(15)); // Fast 15s per-engine boundary

                    var directRes = await KeylessClient.CompleteAsync(prompt, target, onChunk, cts.Token);
                    if (directRes.Success && !string.IsNullOrWhiteSpace(directRes.OutputText))
                    {
                        return directRes with { ModelUsed = $"Auto ({target})" };
                    }
                }
                catch
                {
                    // Fast failover to next engine in cascade
                }
            }
        }
        else if (modelId.StartsWith("ovh") || modelId.StartsWith("kilo"))
        {
            try
            {
                var directRes = await KeylessClient.CompleteAsync(prompt, modelId, onChunk, cancel);
                if (directRes.Success) return directRes;
            }
            catch { }
        }

        // 2. Mega Zword CLI Fallover Router (Groq, Cloudflare, Gemini, Nvidia)
        string megazwordExe = @"C:\Users\mrmar\mega-zword\.venv\Scripts\megazword.exe";
        if (!File.Exists(megazwordExe))
        {
            string altPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "mega-zword", ".venv", "Scripts", "megazword.exe");
            if (File.Exists(altPath)) megazwordExe = altPath;
        }

        if (File.Exists(megazwordExe))
        {
            var psi = new ProcessStartInfo
            {
                FileName = megazwordExe,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
                StandardOutputEncoding = System.Text.Encoding.UTF8,
                StandardErrorEncoding = System.Text.Encoding.UTF8
            };

            if (modelId == "auto")
            {
                psi.ArgumentList.Add("run");
                psi.ArgumentList.Add("--free-only");
                psi.ArgumentList.Add(prompt);
            }
            else
            {
                psi.ArgumentList.Add("run");
                psi.ArgumentList.Add("-m");
                psi.ArgumentList.Add(modelId);
                psi.ArgumentList.Add(prompt);
            }

            try
            {
                using var proc = new Process { StartInfo = psi };
                proc.Start();

                var outTask = proc.StandardOutput.ReadToEndAsync();
                var errTask = proc.StandardError.ReadToEndAsync();

                if (await Task.WhenAny(Task.WhenAll(outTask, errTask), Task.Delay(20000, cancel)) == Task.Delay(20000, cancel))
                {
                    try { proc.Kill(); } catch { }
                }
                else
                {
                    await proc.WaitForExitAsync(cancel);
                    string rawOut = await outTask;
                    string rawErr = await errTask;

                    string detectedModel = modelId;
                    var match = Regex.Match(rawErr + "\n" + rawOut, @"using\s+([\w\-]+)");
                    if (match.Success) detectedModel = match.Groups[1].Value;

                    var cleanLines = rawOut.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)
                        .Where(l => !l.StartsWith("[megazword]") && !l.StartsWith("cli:"))
                        .ToList();

                    string resultText = string.Join("\r\n", cleanLines).Trim();
                    if (proc.ExitCode == 0 && !string.IsNullOrWhiteSpace(resultText))
                    {
                        onChunk?.Invoke(resultText);
                        sw.Stop();
                        return new CompletionResult(true, detectedModel, resultText, sw.Elapsed.TotalSeconds);
                    }
                }
            }
            catch { }
        }

        sw.Stop();
        return new CompletionResult(false, "offline", "", sw.Elapsed.TotalSeconds, "All free tiers momentarily busy. Please try again in 5s.");
    }
}
