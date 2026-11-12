using RobinCode;

static class Program
{
    static int failures;
    static void Check(bool ok, string description)
    {
        Console.WriteLine((ok ? "PASS " : "FAIL ") + description);
        if (!ok) failures++;
    }

    static int Main()
    {
        string vault = Path.Combine(Path.GetTempPath(), "robin-vault-checks-" + Guid.NewGuid().ToString("N"));
        try
        {
            Directory.CreateDirectory(Path.Combine(vault, ".obsidian"));
            Directory.CreateDirectory(Path.Combine(vault, "Songs"));
            Directory.CreateDirectory(Path.Combine(vault, ".trash"));
            File.WriteAllText(Path.Combine(vault, "Songs", "Harbor lights.md"), "---\ntags: [lyrics]\n---\nVerse ideas about the harbor at night, lights on the water.");
            File.WriteAllText(Path.Combine(vault, "Groceries.md"), "Eggs, milk, bread.");
            File.WriteAllText(Path.Combine(vault, "Diary.md"), "---\nrobin: private\n---\nThe harbor where we broke up.");
            File.WriteAllText(Path.Combine(vault, "Taxes.md"), "---\nprivate: true\n---\nharbor tax stuff");
            File.WriteAllText(Path.Combine(vault, "Tagged.md"), "---\ntags:\n  - songs\n  - private\n---\nharbor secret song");
            File.WriteAllText(Path.Combine(vault, ".trash", "Old harbor.md"), "harbor harbor harbor");
            File.WriteAllText(Path.Combine(vault, "Login.md"), "---\napi_key: sk-live-12345\nmood: calm\n---\nharbor setup notes. The key is sk-live-12345 here.");
            File.WriteAllText(Path.Combine(vault, ObsidianVault.SecretsFile), "{\"bank\": \"9876-5432\", \"list\": [\"hunter22\"], \"short\": \"ab\"}");

            Check(ObsidianVault.LooksLikeVault(vault), "a folder with .obsidian is a vault");
            Check(!ObsidianVault.LooksLikeVault(Path.Combine(vault, "missing")), "a missing folder is not a vault");
            Check(!ObsidianVault.LooksLikeVault(""), "an empty setting is not a vault");

            var notes = ObsidianVault.FindRelevant(vault, "Write a chorus about the harbor lights");
            var titles = notes.Select(n => n.Title).ToList();
            Check(titles.FirstOrDefault() == "Harbor lights", "the note whose title matches ranks first");
            Check(!titles.Contains("Groceries"), "unrelated notes are left out");
            Check(!titles.Contains("Diary"), "robin: private notes are never read");
            Check(!titles.Contains("Taxes"), "private: true notes are never read");
            Check(!titles.Contains("Tagged"), "notes tagged private (block list) are never read");
            Check(!titles.Contains("Old harbor"), ".trash is skipped");
            Check(notes.All(n => !n.Body.Contains("tags:")), "frontmatter is never included");
            Check(ObsidianVault.FindRelevant(vault, "the and of").Count == 0, "a request with no real words picks nothing");
            Check(ObsidianVault.FindRelevant(vault, "harbor", budget: 10).Count == 0, "notes that don't fit the budget are dropped, not cut mid-way");

            var secrets = ObsidianVault.LoadSecrets(vault);
            Check(secrets.Contains("sk-live-12345"), "secret-looking frontmatter keys are secrets");
            Check(!secrets.Contains("calm"), "ordinary frontmatter values are not secrets");
            Check(secrets.Contains("9876-5432") && secrets.Contains("hunter22"), "_vault_secrets.json values (nested too) are secrets");
            Check(!secrets.Contains("ab"), "values under 4 characters are ignored");

            string shielded = ObsidianVault.Shield(ObsidianVault.Format(notes), secrets);
            Check(titles.Contains("Login") && !shielded.Contains("sk-live-12345"), "a relevant note's secret is hidden before sending");
            Check(shielded.Contains(ObsidianVault.Hidden), "hidden values are marked [hidden]");
            Check(ObsidianVault.Shield("abc-secret-long", new[] { "secret", "abc-secret-long" }) == ObsidianVault.Hidden, "longer secrets are hidden first");

            Check(ObsidianVault.Format(Array.Empty<VaultNote>()) == "", "no notes adds nothing to the prompt");
            var (front, body) = ObsidianVault.SplitFrontmatter("---\r\na: b\r\n---\r\nhello");
            Check(front.Trim() == "a: b" && body == "hello", "Windows line endings in frontmatter are handled");

            // Holes. These should fail until ObsidianVault.cs treats them as private or secret.
            File.WriteAllText(Path.Combine(vault, "Quoted tag.md"), "---\ntags: [\"private\"]\n---\nharbor quoted tag");
            File.WriteAllText(Path.Combine(vault, "Quoted block.md"), "---\ntags:\n  - \"private\"\n---\nharbor quoted block");
            File.WriteAllText(Path.Combine(vault, "Commented.md"), "---\nprivate: true # keep out\n---\nharbor comment marker");
            File.WriteAllText(Path.Combine(vault, "Flow key.md"), "---\napi_key: [sk-flow-aaaa, sk-flow-bbbb]\n---\nharbor setup. The key is sk-flow-aaaa here.");
            var leaked = ObsidianVault.FindRelevant(vault, "Write a chorus about the harbor lights").Select(n => n.Title).ToList();
            Check(!leaked.Contains("Quoted tag"), "a quoted flow tag [\"private\"] is never read");
            Check(!leaked.Contains("Quoted block"), "a quoted block tag \"private\" is never read");
            Check(!leaked.Contains("Commented"), "private: true with a trailing comment is never read");
            string flowShield = ObsidianVault.Shield(
                ObsidianVault.Format(ObsidianVault.FindRelevant(vault, "harbor setup")),
                ObsidianVault.LoadSecrets(vault));
            Check(!flowShield.Contains("sk-flow-aaaa"), "each key in an api_key flow list is hidden");
        }
        finally { try { Directory.Delete(vault, true); } catch { } }
        Console.WriteLine(failures == 0 ? "ALL PASS" : $"{failures} FAILED");
        return failures == 0 ? 0 : 1;
    }
}
