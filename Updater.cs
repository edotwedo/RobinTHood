using System.Diagnostics;
using System.Net.Http.Headers;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace RobinCode;

public sealed record UpdateInfo(Version Version, string Tag, Uri Download, long Size, string Sha256);

/// <summary>The update check didn't get a usable answer (offline, rate limited, bad data).</summary>
public sealed class UpdateCheckException(string message, Exception? inner = null) : Exception(message, inner);

/// <summary>Finds a newer GitHub release and installs it beside the running copy.
/// Only release metadata is requested; no project text leaves the computer. An update
/// is offered only when its SHA-256 is known, and the download must match it.</summary>
public static class Updater
{
    public const string LatestReleaseApi = "https://api.github.com/repos/edotwedo/RobinTHood/releases/latest";
    const string AssetName = "RobinTHood.exe";
    static readonly HttpClient DefaultHttp = CreateClient();

    public static Version CurrentVersion
    {
        get
        {
            string? informational = Assembly.GetExecutingAssembly().GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion;
            return ParseVersion(informational) ?? Assembly.GetExecutingAssembly().GetName().Version ?? new Version(0, 0);
        }
    }

    internal static Version? ParseVersion(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        var match = Regex.Match(text, @"^v?(\d+)\.(\d+)(?:\.(\d+))?");
        if (!match.Success) return null;
        return new Version(int.Parse(match.Groups[1].Value), int.Parse(match.Groups[2].Value),
            match.Groups[3].Success ? int.Parse(match.Groups[3].Value) : 0);
    }

    /// <summary>Returns the latest release if it is newer than <paramref name="current"/> and installable,
    /// or null when there is nothing to install. Throws <see cref="UpdateCheckException"/> when GitHub
    /// couldn't be asked or answered unusably, so callers never mistake "didn't check" for "up to date".</summary>
    public static async Task<UpdateInfo?> CheckAsync(CancellationToken cancel, Version? current = null, HttpClient? http = null)
    {
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancel);
            timeout.CancelAfter(TimeSpan.FromSeconds(15));
            using var request = new HttpRequestMessage(HttpMethod.Get, LatestReleaseApi);
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.github+json"));
            using var response = await (http ?? DefaultHttp).SendAsync(request, timeout.Token);
            if (!response.IsSuccessStatusCode) throw new UpdateCheckException($"GitHub answered {(int)response.StatusCode}.");
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(timeout.Token));
            var root = json.RootElement;
            if (root.TryGetProperty("draft", out var draft) && draft.GetBoolean()) return null;
            if (root.TryGetProperty("prerelease", out var pre) && pre.GetBoolean()) return null;
            string tag = root.GetProperty("tag_name").GetString() ?? "";
            var version = ParseVersion(tag);
            if (version is null || version <= (current ?? CurrentVersion)) return null;

            foreach (var asset in root.GetProperty("assets").EnumerateArray())
            {
                if (asset.GetProperty("name").GetString() != AssetName) continue;
                string? url = asset.GetProperty("browser_download_url").GetString();
                long size = asset.GetProperty("size").GetInt64();
                string? sha = asset.TryGetProperty("digest", out var digest) && digest.GetString() is { } d && d.StartsWith("sha256:", StringComparison.OrdinalIgnoreCase)
                    ? d[7..] : null;
                // Older releases have no API digest; fall back to the hash published in the notes.
                if (sha is null && root.TryGetProperty("body", out var body))
                {
                    var noted = Regex.Match(body.GetString() ?? "", @"SHA-?256:\s*`?([0-9a-fA-F]{64})");
                    if (noted.Success) sha = noted.Groups[1].Value;
                }
                if (url is null || sha is null || !Uri.TryCreate(url, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps) return null;
                return new UpdateInfo(version, tag, uri, size, sha.ToLowerInvariant());
            }
            return null;
        }
        catch (Exception ex) when (ex is not UpdateCheckException && (ex is not OperationCanceledException || !cancel.IsCancellationRequested))
        {
            throw new UpdateCheckException("Couldn't reach GitHub.", ex);
        }
    }

    /// <summary>Downloads and verifies the update, installs it into its own content-addressed
    /// folder and points an existing desktop shortcut at it. Returns the new executable path.</summary>
    public static async Task<string> InstallAsync(UpdateInfo update, IProgress<int>? progress, CancellationToken cancel,
        HttpClient? http = null, string? installationRoot = null, string? desktopDirectory = null)
    {
        string root = installationRoot ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "RobinTHood");
        Directory.CreateDirectory(root);
        // Partial files from an update interrupted by a crash or power loss.
        foreach (string stale in Directory.EnumerateFiles(root, ".download-*.exe"))
            try { if (File.GetLastWriteTimeUtc(stale) < DateTime.UtcNow.AddHours(-1)) File.Delete(stale); } catch (IOException) { }
        string temp = Path.Combine(root, $".download-{Guid.NewGuid():N}.exe");
        try
        {
            using (var response = await (http ?? DefaultHttp).GetAsync(update.Download, HttpCompletionOption.ResponseHeadersRead, cancel))
            {
                response.EnsureSuccessStatusCode();
                await using var input = await response.Content.ReadAsStreamAsync(cancel);
                await using var output = File.Create(temp);
                var buffer = new byte[81920];
                long total = 0;
                int read, lastPercent = -1;
                while ((read = await input.ReadAsync(buffer, cancel)) > 0)
                {
                    total += read;
                    if (total > update.Size) throw new IOException("The update is larger than announced and was discarded.");
                    await output.WriteAsync(buffer.AsMemory(0, read), cancel);
                    int percent = update.Size > 0 ? (int)(total * 100 / update.Size) : 0;
                    if (percent != lastPercent) progress?.Report(lastPercent = percent);
                }
                if (total != update.Size) throw new IOException("The update download was incomplete and was discarded.");
            }

            string actual;
            await using (var check = File.OpenRead(temp)) actual = Convert.ToHexString(await SHA256.HashDataAsync(check, cancel)).ToLowerInvariant();
            if (actual != update.Sha256) throw new IOException("The update didn't match its published fingerprint and was discarded.");

            string folder = Path.Combine(root, actual.ToUpperInvariant()[..12]);
            Directory.CreateDirectory(folder);
            string exe = Path.Combine(folder, AssetName);
            File.Move(temp, exe, overwrite: true);

            string desktop = desktopDirectory ?? Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
            if (File.Exists(Path.Combine(desktop, "RobinTHood.lnk")))
                DesktopSetup.CreateShortcut(sourceDirectory: folder, executablePath: exe, desktopDirectory: desktop, installationRoot: root);
            return exe;
        }
        finally
        {
            if (File.Exists(temp)) File.Delete(temp);
        }
    }

    /// <summary>Starts the new copy, which waits for this process to exit before opening the workspace.</summary>
    public static void Relaunch(string executable)
    {
        var start = new ProcessStartInfo(executable) { UseShellExecute = false, WorkingDirectory = Path.GetDirectoryName(executable)! };
        start.ArgumentList.Add("--after-update");
        start.ArgumentList.Add(Environment.ProcessId.ToString());
        Process.Start(start);
    }

    /// <summary>Called at startup: if launched by an update, wait (bounded) for the old copy to close
    /// so the project lock is free.</summary>
    public static void WaitForPreviousCopy(string[] args)
    {
        int index = Array.IndexOf(args, "--after-update");
        if (index < 0 || index + 1 >= args.Length || !int.TryParse(args[index + 1], out int pid)) return;
        try { using var old = Process.GetProcessById(pid); old.WaitForExit(15000); }
        catch (ArgumentException) { } // Already gone.
    }

    static HttpClient CreateClient()
    {
        var client = new HttpClient { Timeout = TimeSpan.FromMinutes(10) };
        client.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("RobinTHood", CurrentVersion.ToString()));
        return client;
    }
}
