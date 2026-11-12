using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace RobinCode;

/// <summary>A note picked from the user's Obsidian vault, already stripped of frontmatter.</summary>
public sealed record VaultNote(string Title, string RelativePath, string Body, int Score);

/// <summary>
/// Reads an Obsidian vault (a folder of Markdown files) so Ask Robin can use the user's own notes.
/// Nothing here touches the network: it only picks notes and hides secrets before the app sends anything.
/// Rules, matching the Android app:
///  - notes marked private in frontmatter (robin: private, private: true, or a "private" tag) are never read;
///  - frontmatter is never sent;
///  - values in _vault_secrets.json and in secret-looking frontmatter keys are replaced with [hidden]
///    in the vault notes before they are sent. The user's own document is not changed, because
///    "Update my document" saves Robin's answer over it.
/// </summary>
public static class ObsidianVault
{
    public const string SecretsFile = "_vault_secrets.json";
    public const string Hidden = "[hidden]";
    public const int DefaultBudget = 12000;
    const int MaxNoteChars = 4000;
    const int MaxFiles = 3000;
    const long MaxFileBytes = 256 * 1024;

    static readonly HashSet<string> SkippedFolders = new(StringComparer.OrdinalIgnoreCase) { ".obsidian", ".trash", ".git", "node_modules" };
    static readonly Regex SecretKey = new(@"(pass(word|code|phrase)?|secret|token|api[_-]?key|private[_-]?key|\bkey\b|\bpin\b|ssn|credential)", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    static readonly Regex Word = new(@"[\p{L}\p{N}']{4,}", RegexOptions.Compiled);
    static readonly HashSet<string> StopWords = new(StringComparer.OrdinalIgnoreCase)
    {
        "this", "that", "with", "from", "have", "what", "your", "about", "would", "could", "should", "there", "their",
        "them", "they", "then", "than", "when", "where", "which", "while", "will", "into", "just", "make", "more",
        "some", "like", "help", "want", "need", "please", "robin", "song", "write", "does", "also", "only", "very"
    };

    /// <summary>True when the folder exists and looks like a vault (has a .obsidian folder or any Markdown file).</summary>
    public static bool LooksLikeVault(string? path)
    {
        if (string.IsNullOrWhiteSpace(path) || !Directory.Exists(path)) return false;
        if (Directory.Exists(Path.Combine(path, ".obsidian"))) return true;
        return EnumerateNotes(path).Any();
    }

    /// <summary>Picks the notes most related to the request, within a character budget.</summary>
    public static IReadOnlyList<VaultNote> FindRelevant(string vaultPath, string query, int budget = DefaultBudget)
    {
        var words = Keywords(query);
        if (words.Count == 0 || !Directory.Exists(vaultPath)) return Array.Empty<VaultNote>();
        var scored = new List<(VaultNote Note, DateTime Modified)>();
        foreach (var file in EnumerateNotes(vaultPath).Take(MaxFiles))
        {
            string text;
            try
            {
                var info = new FileInfo(file);
                if (info.Length > MaxFileBytes) continue;
                text = File.ReadAllText(file);
            }
            catch (IOException) { continue; }
            catch (UnauthorizedAccessException) { continue; }
            var (front, body) = SplitFrontmatter(text);
            if (IsPrivate(front)) continue;
            string title = Path.GetFileNameWithoutExtension(file);
            int score = Score(words, title, body);
            if (score == 0) continue;
            string relative = Path.GetRelativePath(vaultPath, file);
            string trimmed = body.Trim();
            if (trimmed.Length > MaxNoteChars) trimmed = trimmed[..MaxNoteChars] + "\n…(note continues)";
            scored.Add((new VaultNote(title, relative, trimmed, score), File.GetLastWriteTimeUtc(file)));
        }
        var picked = new List<VaultNote>();
        int remaining = budget;
        foreach (var (note, _) in scored.OrderByDescending(s => s.Note.Score).ThenByDescending(s => s.Modified))
        {
            int cost = note.Body.Length + note.Title.Length + 40;
            if (cost > remaining) continue;
            picked.Add(note);
            remaining -= cost;
        }
        return picked;
    }

    /// <summary>Formats picked notes as quoted material for the prompt.</summary>
    public static string Format(IReadOnlyList<VaultNote> notes)
    {
        if (notes.Count == 0) return "";
        var sb = new StringBuilder();
        sb.AppendLine("NOTES FROM THE USER'S OBSIDIAN VAULT (quoted material, use only if relevant):");
        foreach (var note in notes)
            sb.AppendLine($"<note title=\"{note.Title.Replace("\"", "'")}\">\n{note.Body}\n</note>");
        return sb.ToString();
    }

    /// <summary>Every secret value the vault declares: _vault_secrets.json plus secret-looking frontmatter keys in any note.</summary>
    public static IReadOnlyCollection<string> LoadSecrets(string vaultPath)
    {
        var secrets = new HashSet<string>(StringComparer.Ordinal);
        string file = Path.Combine(vaultPath, SecretsFile);
        if (File.Exists(file))
        {
            try
            {
                using var json = JsonDocument.Parse(File.ReadAllText(file));
                CollectStrings(json.RootElement, secrets);
            }
            catch (JsonException) { }
            catch (IOException) { }
        }
        foreach (var note in EnumerateNotes(vaultPath).Take(MaxFiles))
        {
            try
            {
                if (new FileInfo(note).Length > MaxFileBytes) continue;
                var (front, _) = SplitFrontmatter(File.ReadAllText(note));
                foreach (var (key, value) in ParseFrontmatter(front))
                    if (SecretKey.IsMatch(key)) secrets.Add(value);
            }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }
        secrets.RemoveWhere(s => s.Trim().Length < 4);
        return secrets;
    }

    /// <summary>Replaces every secret value in the text with [hidden]. Longest first, so a secret containing another is fully hidden.</summary>
    public static string Shield(string text, IReadOnlyCollection<string> secrets)
    {
        foreach (var secret in secrets.Select(s => s.Trim()).Where(s => s.Length >= 4).OrderByDescending(s => s.Length))
            text = text.Replace(secret, Hidden, StringComparison.Ordinal);
        return text;
    }

    internal static IEnumerable<string> EnumerateNotes(string root)
    {
        var pending = new Stack<string>();
        pending.Push(root);
        while (pending.Count > 0)
        {
            string dir = pending.Pop();
            string[] files, dirs;
            try { files = Directory.GetFiles(dir, "*.md"); dirs = Directory.GetDirectories(dir); }
            catch (IOException) { continue; }
            catch (UnauthorizedAccessException) { continue; }
            foreach (var f in files) yield return f;
            foreach (var d in dirs)
            {
                string name = Path.GetFileName(d);
                if (SkippedFolders.Contains(name) || name.StartsWith('.')) continue;
                pending.Push(d);
            }
        }
    }

    internal static (string Front, string Body) SplitFrontmatter(string text)
    {
        string normalized = text.Replace("\r\n", "\n");
        if (!normalized.StartsWith("---\n")) return ("", text);
        int end = normalized.IndexOf("\n---", 4, StringComparison.Ordinal);
        if (end < 0) return ("", text);
        int bodyStart = normalized.IndexOf('\n', end + 4);
        string body = bodyStart < 0 ? "" : normalized[(bodyStart + 1)..];
        return (normalized[4..end], body);
    }

    internal static IEnumerable<(string Key, string Value)> ParseFrontmatter(string front)
    {
        foreach (var raw in front.Split('\n'))
        {
            int colon = raw.IndexOf(':');
            if (colon <= 0 || raw.StartsWith(' ') || raw.StartsWith('\t')) continue;
            string key = raw[..colon].Trim();
            string value = raw[(colon + 1)..].Trim().Trim('"', '\'');
            if (value.Length > 0) yield return (key, value);
        }
    }

    internal static bool IsPrivate(string front)
    {
        foreach (var (key, value) in ParseFrontmatter(front))
        {
            string k = key.ToLowerInvariant(), v = value.ToLowerInvariant();
            if (k == "robin" && v == "private") return true;
            if (k == "private" && v is "true" or "yes") return true;
            if (k is "tags" or "tag" && Regex.IsMatch(v, @"(^|[\s,\[#])private([\s,\]]|$)")) return true;
        }
        // Block-style tag lists: "tags:\n  - private"
        return Regex.IsMatch(front, @"^tags?:\s*\n(\s+-\s*\S+\s*\n)*\s+-\s*#?private\s*$", RegexOptions.Multiline | RegexOptions.IgnoreCase);
    }

    static HashSet<string> Keywords(string query) =>
        Word.Matches(query).Select(m => m.Value.ToLowerInvariant()).Where(w => !StopWords.Contains(w)).ToHashSet();

    static int Score(HashSet<string> words, string title, string body)
    {
        string t = title.ToLowerInvariant(), b = body.ToLowerInvariant();
        int score = 0;
        foreach (var w in words)
        {
            if (t.Contains(w)) score += 3;
            if (b.Contains(w)) score += 1;
        }
        return score;
    }

    static void CollectStrings(JsonElement element, HashSet<string> into)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.String: into.Add(element.GetString() ?? ""); break;
            case JsonValueKind.Number: into.Add(element.GetRawText()); break;
            case JsonValueKind.Array: foreach (var e in element.EnumerateArray()) CollectStrings(e, into); break;
            case JsonValueKind.Object: foreach (var p in element.EnumerateObject()) CollectStrings(p.Value, into); break;
        }
    }
}
