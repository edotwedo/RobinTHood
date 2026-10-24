using System.Drawing.Drawing2D;

namespace RobinCode;

public enum SkinTheme
{
    EmeraldForest, // Robin Hood Classic (Green & Gold)
    AmberPhosphor, // Vintage CRT Terminal
    CyberpunkNight, // Neon Cyan & Purple
    ObsidianDark   // Clean Modern Stealth
}

public static class Skin
{
    public static SkinTheme Current { get; private set; } = SkinTheme.EmeraldForest;

    public static Color Bg { get; private set; } = Color.FromArgb(0x0a, 0x14, 0x10);
    public static Color CardBg { get; private set; } = Color.FromArgb(0x11, 0x22, 0x1a);
    public static Color InputBg { get; private set; } = Color.FromArgb(0x06, 0x0d, 0x0a);
    public static Color Accent { get; private set; } = Color.FromArgb(0x2d, 0xd4, 0xbf); // Emerald mint
    public static Color Gold { get; private set; } = Color.FromArgb(0xff, 0xd1, 0x66);
    public static Color Text { get; private set; } = Color.FromArgb(0xe8, 0xf5, 0xe9);
    public static Color Muted { get; private set; } = Color.FromArgb(0x74, 0xa8, 0x92);
    public static Color Border { get; private set; } = Color.FromArgb(0x1b, 0x43, 0x32);
    public static Color GreenGlow { get; private set; } = Color.FromArgb(0x40, 0x91, 0x6c);

    public static readonly Font TitleFont = new("Segoe UI", 12f, FontStyle.Bold);
    public static readonly Font SubtitleFont = new("Segoe UI", 9f, FontStyle.Regular);
    public static readonly Font CodeFont = new("Consolas", 10f, FontStyle.Regular);
    public static readonly Font ButtonFont = new("Segoe UI", 9.5f, FontStyle.Bold);
    public static readonly Font StatFont = new("Consolas", 14f, FontStyle.Bold);

    public static void SetTheme(SkinTheme theme)
    {
        Current = theme;
        switch (theme)
        {
            case SkinTheme.EmeraldForest:
                Bg = Color.FromArgb(0x0a, 0x14, 0x10);
                CardBg = Color.FromArgb(0x11, 0x22, 0x1a);
                InputBg = Color.FromArgb(0x06, 0x0d, 0x0a);
                Accent = Color.FromArgb(0x52, 0xb7, 0x88);
                Gold = Color.FromArgb(0xff, 0xd1, 0x66);
                Text = Color.FromArgb(0xe8, 0xf5, 0xe9);
                Muted = Color.FromArgb(0x74, 0xa8, 0x92);
                Border = Color.FromArgb(0x2d, 0x6a, 0x4f);
                GreenGlow = Color.FromArgb(0x40, 0x91, 0x6c);
                break;

            case SkinTheme.AmberPhosphor:
                Bg = Color.FromArgb(0x12, 0x0a, 0x02);
                CardBg = Color.FromArgb(0x22, 0x14, 0x04);
                InputBg = Color.FromArgb(0x0a, 0x05, 0x01);
                Accent = Color.FromArgb(0xff, 0xb7, 0x03);
                Gold = Color.FromArgb(0xfb, 0x85, 0x00);
                Text = Color.FromArgb(0xff, 0xf1, 0xd0);
                Muted = Color.FromArgb(0xa6, 0x7c, 0x52);
                Border = Color.FromArgb(0x54, 0x32, 0x0a);
                GreenGlow = Color.FromArgb(0xff, 0xb7, 0x03);
                break;

            case SkinTheme.CyberpunkNight:
                Bg = Color.FromArgb(0x08, 0x0a, 0x12);
                CardBg = Color.FromArgb(0x10, 0x14, 0x24);
                InputBg = Color.FromArgb(0x04, 0x06, 0x0c);
                Accent = Color.FromArgb(0x00, 0xf5, 0xd4);
                Gold = Color.FromArgb(0xf7, 0x25, 0x85);
                Text = Color.FromArgb(0xe2, 0xe8, 0xf0);
                Muted = Color.FromArgb(0x64, 0x74, 0x8b);
                Border = Color.FromArgb(0x1e, 0x29, 0x3b);
                GreenGlow = Color.FromArgb(0x00, 0xf5, 0xd4);
                break;

            case SkinTheme.ObsidianDark:
                Bg = Color.FromArgb(0x12, 0x12, 0x16);
                CardBg = Color.FromArgb(0x1c, 0x1c, 0x24);
                InputBg = Color.FromArgb(0x0c, 0x0c, 0x10);
                Accent = Color.FromArgb(0x9d, 0x4e, 0xdd);
                Gold = Color.FromArgb(0xc7, 0x7d, 0xff);
                Text = Color.FromArgb(0xf1, 0xf5, 0xf9);
                Muted = Color.FromArgb(0x94, 0xa3, 0xb8);
                Border = Color.FromArgb(0x33, 0x33, 0x44);
                GreenGlow = Color.FromArgb(0x9d, 0x4e, 0xdd);
                break;
        }
    }
}
