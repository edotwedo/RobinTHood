using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Cryptography;

namespace RobinCode;

public static class DesktopSetup
{
    public static string CreateShortcut(string? sourceDirectory = null, string? executablePath = null,
        string? desktopDirectory = null, string? installationRoot = null)
    {
        string exe = executablePath ?? Environment.ProcessPath ?? throw new IOException("Can't locate Robin's application file.");
        string source = sourceDirectory ?? AppContext.BaseDirectory;
        // Content-addressed folders allow updating an installed copy without replacing a running exe.
        string hash;
        string assembly = Path.Combine(source, "RobinTHood.dll");
        using (var stream = File.OpenRead(File.Exists(assembly) ? assembly : exe)) hash = Convert.ToHexString(SHA256.HashData(stream))[..12];
        string target = Path.Combine(installationRoot ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "RobinTHood"), hash);
        if (!Path.GetFullPath(source).TrimEnd(Path.DirectorySeparatorChar).Equals(target, StringComparison.OrdinalIgnoreCase))
            CopyApplication(source, target);
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

    static void CopyApplication(string source, string destination)
    {
        Directory.CreateDirectory(destination);
        foreach (var file in Directory.EnumerateFiles(source))
        {
            if ((File.GetAttributes(file) & FileAttributes.ReparsePoint) != 0) continue;
            File.Copy(file, Path.Combine(destination, Path.GetFileName(file)), true);
        }
        foreach (var folder in Directory.EnumerateDirectories(source))
        {
            if ((File.GetAttributes(folder) & FileAttributes.ReparsePoint) != 0) continue;
            CopyApplication(folder, Path.Combine(destination, Path.GetFileName(folder)));
        }
    }

    public static void OpenFolder(string path) => Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
}
