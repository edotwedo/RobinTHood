using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.Json;

namespace RobinCode;

public static class DesktopSetup
{
    public static string CreateShortcut(string? sourceDirectory = null, string? executablePath = null,
        string? desktopDirectory = null, string? installationRoot = null)
    {
        string exe = executablePath ?? Environment.ProcessPath ?? throw new IOException("Can't locate Robin's application file.");
        string source = Path.GetFullPath(sourceDirectory ?? AppContext.BaseDirectory);
        bool bundled = sourceDirectory is null && executablePath is null && IsBundled();
        var files = ApplicationFiles(source, exe, bundled);
        // Content-addressed folders allow updating an installed copy without replacing a running exe.
        string hash;
        string assembly = Path.Combine(source, "RobinTHood.dll");
        using (var stream = File.OpenRead(Inside(source, !bundled && File.Exists(assembly) ? "RobinTHood.dll" : Path.GetFileName(exe)))) hash = Convert.ToHexString(SHA256.HashData(stream))[..12];
        string target = Path.Combine(installationRoot ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "RobinTHood"), hash);
        if (!Path.GetFullPath(source).TrimEnd(Path.DirectorySeparatorChar).Equals(target, StringComparison.OrdinalIgnoreCase))
            CopyApplication(source, target, files);
        string installedExe = Path.Combine(target, Path.GetFileName(exe));
        if (!File.Exists(installedExe)) throw new IOException("Robin's app copy is incomplete; the shortcut was not created.");
        string shortcut = Path.Combine(desktopDirectory ?? Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "RobinTHood.lnk");
        object? shell = null, link = null;
        try
        {
            shell = Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell") ?? throw new IOException("Windows shortcut support is unavailable."));
            dynamic automation = shell!;
            link = automation.CreateShortcut(shortcut);
            dynamic item = link;
            item.TargetPath = installedExe;
            item.WorkingDirectory = target;
            item.Description = "RobinTHood — your creative workspace";
            item.IconLocation = installedExe + ",0";
            item.Save();
        }
        finally
        {
            if (link is not null) Marshal.FinalReleaseComObject(link);
            if (shell is not null) Marshal.FinalReleaseComObject(shell);
        }
        return shortcut;
    }

    [System.Diagnostics.CodeAnalysis.UnconditionalSuppressMessage("SingleFile", "IL3000", Justification = "Empty assembly location deliberately identifies a bundled application.")]
    static bool IsBundled() => string.IsNullOrEmpty(typeof(DesktopSetup).Assembly.Location);

    static List<string> ApplicationFiles(string source, string executable, bool bundled)
    {
        var files = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { Path.GetFileName(executable) };
        string manifest = Path.Combine(source, "RobinTHood.deps.json");
        if (bundled || (!File.Exists(manifest) && !File.Exists(Path.Combine(source, "RobinTHood.dll"))))
            return files.ToList(); // A single-file download never owns its neighboring files.
        if (!File.Exists(manifest)) throw new IOException("Robin's dependency manifest is missing. Use a complete published app for desktop setup.");
        files.UnionWith(["RobinTHood.dll", "RobinTHood.deps.json", "RobinTHood.runtimeconfig.json"]);
        using var json = JsonDocument.Parse(File.ReadAllText(Inside(source, "RobinTHood.deps.json")));
        string target = json.RootElement.GetProperty("runtimeTarget").GetProperty("name").GetString()
            ?? throw new IOException("Robin's dependency manifest has no runtime target.");
        foreach (var library in json.RootElement.GetProperty("targets").GetProperty(target).EnumerateObject())
        foreach (string group in new[] { "runtime", "native", "resources", "runtimeTargets" })
        {
            if (!library.Value.TryGetProperty(group, out var assets)) continue;
            foreach (var asset in assets.EnumerateObject())
            {
                string relative = asset.Name.Replace('/', Path.DirectorySeparatorChar);
                string file = Inside(source, relative);
                if (!File.Exists(file))
                {
                    relative = Path.GetFileName(relative);
                    file = Inside(source, relative);
                }
                if (!File.Exists(file) && group == "runtimeTargets") continue; // Other RIDs may be listed.
                if (!File.Exists(file)) throw new IOException("Robin's app copy is incomplete: " + relative);
                files.Add(relative);
            }
        }
        return files.ToList();
    }

    static string Inside(string root, string relative)
    {
        string prefix = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        if (Path.IsPathRooted(relative) || relative.Contains(':')) throw new IOException("Invalid application file path.");
        string full = Path.GetFullPath(Path.Combine(prefix, relative));
        if (!full.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) throw new IOException("Application file escapes its folder.");
        for (string? current = full; current is not null && current.StartsWith(prefix, StringComparison.OrdinalIgnoreCase); current = Path.GetDirectoryName(current))
            if ((File.Exists(current) || Directory.Exists(current)) && (File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0)
                throw new IOException("Application file cannot be a link: " + relative);
        return full;
    }

    static void CopyApplication(string source, string destination, IEnumerable<string> files)
    {
        if (Directory.Exists(destination) && (File.GetAttributes(destination) & FileAttributes.ReparsePoint) != 0)
            throw new IOException("Robin's installation folder cannot be a link.");
        Directory.CreateDirectory(destination);
        foreach (string relative in files)
        {
            string from = Inside(source, relative);
            string to = Inside(destination, relative);
            Directory.CreateDirectory(Path.GetDirectoryName(to)!);
            File.Copy(from, to, true);
        }
    }

    public static void OpenFolder(string path) => Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
}
