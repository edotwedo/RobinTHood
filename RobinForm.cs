using System.Diagnostics;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;

namespace RobinCode;

public sealed class RobinForm : Form
{
    const int TitleBarHeight = 32;

    readonly Button skinBtn = new();
    readonly Button proBtn = new();
    readonly Button minBtn = new();
    readonly Button closeBtn = new();

    // Top Header & Stats
    readonly Label titleLabel = new();
    readonly Label bannerLabel = new();
    readonly Label sponsorBadge = new();
    readonly Label statsLabel = new();

    // Rotating Sponsor Engine
    record SponsorAd(string Text, string Url);
    static readonly SponsorAd[] SponsorAds =
    [
        new("★ FEATURED: Dualtooth — Sync Bluetooth & Dual Monitors across Windows & Linux with zero latency ->", "https://github.com/edotwedo/Dualtooth"),
        new("★ FEATURED: Spanda — Autonomous Reddit & dev community lead radar & engagement engine ->", "https://github.com/edotwedo/Spanda"),
        new("★ PARTNER: Neon Serverless Postgres — Instant branching, autoscaling & zero-wait DBs ->", "https://neon.tech"),
        new("★ SPONSOR: Advertise your developer tool to 10,000+ AI engineers ($49/mo) ->", "mailto:sponsor@robincode.dev?subject=RobinTHood%20Sponsorship")
    ];
    int currentAdIndex = 0;
    readonly System.Windows.Forms.Timer adTimer = new();

    // Action Presets
    readonly ComboBox modelCombo = new();
    readonly Button fastCodeBtn = new();
    readonly Button fixBugBtn = new();
    readonly Button refactorBtn = new();
    readonly Button writeTestsBtn = new();

    // Prompt & Output
    readonly TextBox inputEditor = new();
    readonly Button generateBtn = new();
    readonly TextBox outputEditor = new();

    // Bottom Action Bar
    readonly Button copyBtn = new();
    readonly Button saveBtn = new();
    readonly Button clearBtn = new();
    readonly Label statusLabel = new();

    double totalSecondsSaved = 0;
    int requestsCompleted = 0;

    [DllImport("user32.dll")]
    static extern bool ReleaseCapture();
    [DllImport("user32.dll")]
    static extern int SendMessage(IntPtr hWnd, int Msg, int wParam, int lParam);

    public RobinForm()
    {
        Text = "RobinTHood // $0 Free AI Aggregator";
        FormBorderStyle = FormBorderStyle.None;
        DoubleBuffered = true;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(960, 720);
        BackColor = Skin.Bg;

        SetupControls();
        ApplySkin();

        try
        {
            string logoPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "logo.jpg");
            if (!File.Exists(logoPath)) logoPath = @"C:\Users\mrmar\robincode\logo.jpg";
            if (File.Exists(logoPath))
            {
                using var bmp = new Bitmap(logoPath);
                Icon = Icon.FromHandle(bmp.GetHicon());
            }
        }
        catch { }

        MouseDown += (_, e) =>
        {
            if (e.Button == MouseButtons.Left && e.Y < TitleBarHeight)
            {
                ReleaseCapture();
                SendMessage(Handle, 0xA1, 0x2, 0);
            }
        };

        Resize += (_, _) => DoLayout();
    }

    void SetupControls()
    {
        // Window Controls
        skinBtn.Text = "🎨 SKIN";
        skinBtn.FlatStyle = FlatStyle.Flat;
        skinBtn.Font = new Font("Segoe UI", 8.5f, FontStyle.Bold);
        skinBtn.Click += (_, _) => CycleSkin();

        proBtn.Text = "★ UNLOCK PRO ($4.99)";
        proBtn.FlatStyle = FlatStyle.Flat;
        proBtn.Font = new Font("Segoe UI", 8.5f, FontStyle.Bold);
        proBtn.Click += (_, _) => Process.Start(new ProcessStartInfo("https://buy.stripe.com/cNi9AV0CK91h36D9dn9AA05") { UseShellExecute = true });

        minBtn.Text = "—";
        minBtn.FlatStyle = FlatStyle.Flat;
        minBtn.Font = new Font("Segoe UI", 8.5f, FontStyle.Bold);
        minBtn.Click += (_, _) => WindowState = FormWindowState.Minimized;

        closeBtn.Text = "✕";
        closeBtn.FlatStyle = FlatStyle.Flat;
        closeBtn.Font = new Font("Segoe UI", 8.5f, FontStyle.Bold);
        closeBtn.Click += (_, _) => Close();

        // Title and Banner
        titleLabel.Text = "RobinTHood  //  $0 FREE AI AGGREGATOR";
        titleLabel.Font = Skin.TitleFont;
        titleLabel.AutoSize = true;

        bannerLabel.Text = "ROUTING: KILO AUTO • OVH 120B • GROQ 70B • CLOUDFLARE • GEMINI FLASH • LOCAL OLLAMA";
        bannerLabel.Font = Skin.SubtitleFont;
        bannerLabel.AutoSize = true;

        UpdateSponsorBadge();
        sponsorBadge.Font = new Font("Segoe UI", 8.5f, FontStyle.Italic);
        sponsorBadge.Cursor = Cursors.Hand;
        sponsorBadge.Click += (_, _) =>
        {
            var ad = SponsorAds[currentAdIndex % SponsorAds.Length];
            try { Process.Start(new ProcessStartInfo(ad.Url) { UseShellExecute = true }); } catch { }
        };

        adTimer.Interval = 10000; // rotate every 10 seconds
        adTimer.Tick += (_, _) =>
        {
            currentAdIndex = (currentAdIndex + 1) % SponsorAds.Length;
            UpdateSponsorBadge();
        };
        adTimer.Start();

        statsLabel.Text = "TOKENS BILLED: $0.00 FOREVER  |  STATUS: READY";
        statsLabel.Font = new Font("Consolas", 8.5f, FontStyle.Bold);
        statsLabel.AutoSize = true;

        // Model Selector
        foreach (var m in FreeAggregator.CurrentModels)
        {
            modelCombo.Items.Add(m.Name);
        }
        modelCombo.SelectedIndex = 0;
        modelCombo.DropDownStyle = ComboBoxStyle.DropDownList;
        modelCombo.Font = new Font("Segoe UI", 9f, FontStyle.Regular);

        // Action Presets
        ConfigurePresetBtn(fastCodeBtn, "⚡ Fast Code", "Write clean, production-ready implementation for:");
        ConfigurePresetBtn(fixBugBtn, "🐛 Fix Bug", "Find the root cause, fix the bug, and explain why it failed:");
        ConfigurePresetBtn(refactorBtn, "♻ Refactor", "Refactor this code for readability, performance, and best practices:");
        ConfigurePresetBtn(writeTestsBtn, "🧪 Unit Tests", "Write comprehensive unit tests with edge cases for:");

        // Editors
        inputEditor.Multiline = true;
        inputEditor.ScrollBars = ScrollBars.Vertical;
        inputEditor.Font = Skin.CodeFont;
        inputEditor.BorderStyle = BorderStyle.None;
        inputEditor.PlaceholderText = "Paste your code, bug, or prompt here... Press Ctrl+Enter or click GENERATE.";
        inputEditor.KeyDown += async (_, e) =>
        {
            if (e.Control && e.KeyCode == Keys.Enter)
            {
                e.SuppressKeyPress = true;
                await TriggerGenerateAsync();
            }
        };

        generateBtn.Text = "⚡ GENERATE ($0 FREE) ⚡";
        generateBtn.FlatStyle = FlatStyle.Flat;
        generateBtn.Font = Skin.ButtonFont;
        generateBtn.Click += async (_, _) => await TriggerGenerateAsync();

        outputEditor.Multiline = true;
        outputEditor.ScrollBars = ScrollBars.Vertical;
        outputEditor.Font = Skin.CodeFont;
        outputEditor.BorderStyle = BorderStyle.None;
        outputEditor.ReadOnly = true;
        outputEditor.PlaceholderText = "RobinCode output stream will appear here in real-time...";

        // Action Buttons
        copyBtn.Text = "📋 Copy Code";
        copyBtn.FlatStyle = FlatStyle.Flat;
        copyBtn.Font = Skin.ButtonFont;
        copyBtn.Click += (_, _) =>
        {
            if (!string.IsNullOrWhiteSpace(outputEditor.Text))
            {
                Clipboard.SetText(outputEditor.Text);
                statusLabel.Text = "✔ Copied to clipboard!";
            }
        };

        saveBtn.Text = "💾 Save File";
        saveBtn.FlatStyle = FlatStyle.Flat;
        saveBtn.Font = Skin.ButtonFont;
        saveBtn.Click += (_, _) =>
        {
            if (string.IsNullOrWhiteSpace(outputEditor.Text)) return;
            using var sfd = new SaveFileDialog { Filter = "Code Files (*.*)|*.*", FileName = "RobinCode_Output.txt" };
            if (sfd.ShowDialog() == DialogResult.OK)
            {
                File.WriteAllText(sfd.FileName, outputEditor.Text);
                statusLabel.Text = $"✔ Saved to {Path.GetFileName(sfd.FileName)}";
            }
        };

        clearBtn.Text = "🗑 Clear";
        clearBtn.FlatStyle = FlatStyle.Flat;
        clearBtn.Font = Skin.ButtonFont;
        clearBtn.Click += (_, _) =>
        {
            inputEditor.Clear();
            outputEditor.Clear();
            statusLabel.Text = "Ready.";
            inputEditor.Focus();
        };

        statusLabel.Text = "Ready. 100% Free Forever.";
        statusLabel.Font = new Font("Segoe UI", 9f, FontStyle.Regular);
        statusLabel.AutoSize = true;

        Controls.AddRange(
        [
            titleLabel, bannerLabel, sponsorBadge, statsLabel,
            skinBtn, proBtn, minBtn, closeBtn,
            modelCombo, fastCodeBtn, fixBugBtn, refactorBtn, writeTestsBtn,
            inputEditor, generateBtn, outputEditor,
            copyBtn, saveBtn, clearBtn, statusLabel
        ]);

        DoLayout();
    }

    void ConfigurePresetBtn(Button btn, string text, string prefix)
    {
        btn.Text = text;
        btn.FlatStyle = FlatStyle.Flat;
        btn.Font = new Font("Segoe UI", 8.5f, FontStyle.Bold);
        btn.Click += (_, _) =>
        {
            string current = inputEditor.Text.Trim();
            if (string.IsNullOrEmpty(current))
            {
                inputEditor.Text = prefix + "\r\n";
                inputEditor.SelectionStart = inputEditor.Text.Length;
            }
            else if (!current.StartsWith(prefix))
            {
                inputEditor.Text = prefix + "\r\n\r\n" + current;
            }
            inputEditor.Focus();
        };
    }

    void DoLayout()
    {
        int w = ClientSize.Width;
        int h = ClientSize.Height;

        // Top Row: Title + Right Controls
        titleLabel.Location = new Point(14, 8);
        titleLabel.MaximumSize = new Size(w - 320, 24);

        closeBtn.SetBounds(w - 34, 4, 28, 24);
        minBtn.SetBounds(w - 66, 4, 28, 24);
        skinBtn.SetBounds(w - 144, 4, 72, 24);
        proBtn.SetBounds(w - 296, 4, 146, 24);

        // Header Strip
        bannerLabel.Location = new Point(14, 36);
        sponsorBadge.Location = new Point(14, 56);
        statsLabel.Location = new Point(w - statsLabel.PreferredWidth - 14, 42);

        // Preset Strip (Row 1)
        modelCombo.SetBounds(14, 82, 240, 28);
        int presetX = 262;
        int btnW = Math.Max(80, (w - presetX - 14 - 18) / 4);
        fastCodeBtn.SetBounds(presetX, 82, btnW, 28);
        fixBugBtn.SetBounds(presetX + (btnW + 6), 82, btnW, 28);
        refactorBtn.SetBounds(presetX + (btnW + 6) * 2, 82, btnW, 28);
        writeTestsBtn.SetBounds(presetX + (btnW + 6) * 3, 82, btnW, 28);

        // Split Input & Output Editors
        int editorTop = 118;
        int bottomBarH = 46;
        int availableH = h - editorTop - bottomBarH;
        int inputH = (int)(availableH * 0.38);
        int outputH = availableH - inputH - 42;

        inputEditor.SetBounds(14, editorTop, w - 28, inputH);
        generateBtn.SetBounds(14, editorTop + inputH + 6, w - 28, 32);
        outputEditor.SetBounds(14, editorTop + inputH + 44, w - 28, outputH);

        // Bottom Action Bar
        int botY = h - 38;
        copyBtn.SetBounds(14, botY, 110, 28);
        saveBtn.SetBounds(130, botY, 110, 28);
        clearBtn.SetBounds(246, botY, 80, 28);
        statusLabel.Location = new Point(336, botY + 6);
        statusLabel.MaximumSize = new Size(w - 345, 24);
    }

    void ApplySkin()
    {
        BackColor = Skin.Bg;
        titleLabel.ForeColor = Skin.Gold;
        bannerLabel.ForeColor = Skin.Muted;
        sponsorBadge.ForeColor = Skin.Accent;
        statsLabel.ForeColor = Skin.Accent;
        statusLabel.ForeColor = Skin.Text;

        skinBtn.BackColor = Skin.CardBg;
        skinBtn.ForeColor = Skin.Text;
        skinBtn.FlatAppearance.BorderColor = Skin.Border;

        proBtn.BackColor = Skin.Gold;
        proBtn.ForeColor = Color.Black;
        proBtn.FlatAppearance.BorderColor = Skin.Gold;

        minBtn.BackColor = Skin.CardBg;
        minBtn.ForeColor = Skin.Text;
        minBtn.FlatAppearance.BorderColor = Skin.Border;

        closeBtn.BackColor = Skin.CardBg;
        closeBtn.ForeColor = Skin.Text;
        closeBtn.FlatAppearance.BorderColor = Skin.Border;

        modelCombo.BackColor = Skin.CardBg;
        modelCombo.ForeColor = Skin.Text;

        foreach (var btn in new[] { fastCodeBtn, fixBugBtn, refactorBtn, writeTestsBtn, copyBtn, saveBtn, clearBtn })
        {
            btn.BackColor = Skin.CardBg;
            btn.ForeColor = Skin.Text;
            btn.FlatAppearance.BorderColor = Skin.Border;
        }

        inputEditor.BackColor = Skin.InputBg;
        inputEditor.ForeColor = Skin.Text;

        outputEditor.BackColor = Skin.InputBg;
        outputEditor.ForeColor = Skin.Text;

        generateBtn.BackColor = Skin.Accent;
        generateBtn.ForeColor = Color.Black;
        generateBtn.FlatAppearance.BorderColor = Skin.Accent;

        Invalidate();
    }

    void CycleSkin()
    {
        var next = (SkinTheme)(((int)Skin.Current + 1) % 4);
        Skin.SetTheme(next);
        ApplySkin();
    }

    async Task TriggerGenerateAsync()
    {
        string prompt = inputEditor.Text.Trim();
        if (string.IsNullOrWhiteSpace(prompt))
        {
            statusLabel.Text = "Please enter a prompt or code snippet first.";
            return;
        }

        int selectedIdx = modelCombo.SelectedIndex;
        string modelId = FreeAggregator.CurrentModels[Math.Max(0, selectedIdx)].Id;

        generateBtn.Enabled = false;
        generateBtn.Text = "⌛ STREAMING REAL-TIME...";
        outputEditor.Clear();
        statusLabel.Text = $"Connecting to {modelId}... ($0.00 billed)";

        var sw = Stopwatch.StartNew();
        var res = await FreeAggregator.RunPromptStreamAsync(prompt, modelId, chunk =>
        {
            try
            {
                if (IsHandleCreated)
                {
                    BeginInvoke(new Action(() =>
                    {
                        outputEditor.AppendText(chunk);
                        statusLabel.Text = $"Streaming ({sw.Elapsed.TotalSeconds:0.1}s)... ($0.00 billed)";
                    }));
                }
            }
            catch { }
        });

        generateBtn.Enabled = true;
        generateBtn.Text = "⚡ GENERATE ($0 FREE) ⚡";

        if (res.Success)
        {
            requestsCompleted++;
            totalSecondsSaved += res.ElapsedSeconds;

            double estSavedDollars = requestsCompleted * 0.035;
            statsLabel.Text = $"TOKENS BILLED: $0.00 FOREVER  |  SAVED: ~${estSavedDollars:0.00}  |  ENGINE: {res.ModelUsed}";
            statusLabel.Text = $"✔ Complete in {res.ElapsedSeconds:0.1}s via {res.ModelUsed} (Cost: $0.00)";
            currentAdIndex = (currentAdIndex + 1) % SponsorAds.Length;
            UpdateSponsorBadge();
        }
        else
        {
            statusLabel.Text = $"⚠ Error ({res.ElapsedSeconds:0.1}s): {res.ErrorMessage}";
        }
    }

    void UpdateSponsorBadge()
    {
        if (InvokeRequired)
        {
            BeginInvoke(new Action(UpdateSponsorBadge));
            return;
        }
        var ad = SponsorAds[currentAdIndex % SponsorAds.Length];
        sponsorBadge.Text = ad.Text;
    }

    protected override async void OnLoad(EventArgs e)
    {
        base.OnLoad(e);
        await RefreshModelsAsync();
    }

    async Task RefreshModelsAsync()
    {
        await FreeAggregator.RefreshLocalModelsAsync();
        modelCombo.Items.Clear();
        foreach (var m in FreeAggregator.CurrentModels)
        {
            modelCombo.Items.Add(m.Name);
        }
        modelCombo.SelectedIndex = 0;
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        using var pen = new Pen(Skin.Border, 1);
        e.Graphics.DrawRectangle(pen, 0, 0, Width - 1, Height - 1);
        e.Graphics.DrawLine(pen, 0, TitleBarHeight, Width, TitleBarHeight);
    }
}
