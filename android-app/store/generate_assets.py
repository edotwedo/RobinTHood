import os
from PIL import Image, ImageDraw, ImageFont

STORE_DIR = "/home/edotwedo/work/RobinTHood/android-app/store"
ICON_PATH = os.path.join(STORE_DIR, "icon-512.png")
FONT_BOLD = "/usr/share/fonts/liberation/LiberationSans-Bold.ttf"
FONT_REG = "/usr/share/fonts/liberation/LiberationSans-Regular.ttf"

def draw_rounded_rect(draw, bbox, radius, fill=None, outline=None, width=1):
    draw.rounded_rectangle(bbox, radius=radius, fill=fill, outline=outline, width=width)

def generate_feature_graphic():
    width, height = 1024, 500
    img = Image.new("RGBA", (width, height), (11, 15, 25, 255))
    draw = ImageDraw.Draw(img)

    # Subtle radial or horizontal gradient
    for x in range(width):
        ratio = x / width
        r = int(11 * (1 - ratio) + 20 * ratio)
        g = int(15 * (1 - ratio) + 28 * ratio)
        b = int(25 * (1 - ratio) + 50 * ratio)
        draw.line([(x, 0), (x, height)], fill=(r, g, b, 255))

    # Add accent decorative glow
    glow_color = (45, 120, 255, 30)
    draw.ellipse([(-50, -50), (450, 450)], fill=glow_color)
    draw.ellipse([(700, 200), (1200, 700)], fill=(120, 80, 255, 25))

    # Place app icon
    if os.path.exists(ICON_PATH):
        icon = Image.open(ICON_PATH).convert("RGBA").resize((110, 110), Image.Resampling.LANCZOS)
        # Create rounded mask for icon
        mask = Image.new("L", (110, 110), 0)
        mask_draw = ImageDraw.Draw(mask)
        mask_draw.rounded_rectangle([(0, 0), (110, 110)], radius=24, fill=255)
        img.paste(icon, (60, 50), mask)

    f_title = ImageFont.truetype(FONT_BOLD, 38)
    f_brand = ImageFont.truetype(FONT_BOLD, 28)
    f_sub = ImageFont.truetype(FONT_REG, 20)
    f_badge = ImageFont.truetype(FONT_BOLD, 15)

    # Brand Title next to icon
    draw.text((190, 65), "RobinTHood", fill=(255, 255, 255, 255), font=f_brand)
    draw.text((190, 105), "Autonomous AI & Local Vault Agent", fill=(96, 165, 250, 255), font=f_sub)

    # Hero headline
    draw.text((60, 195), "The Autonomous AI Agent\nfor Your Local Notes", fill=(255, 255, 255, 255), font=f_title, spacing=8)

    # Subhead bullets
    draw.text((60, 310), "• Live Web Research with Full Fact Synthesis\n• Reads & Writes Real Obsidian Vaults (.md)\n• 100% Free, Keyless & Sovereign — Zero Accounts", fill=(203, 213, 225, 255), font=f_sub, spacing=10)

    # Badges at bottom
    badge_x = 60
    draw_rounded_rect(draw, [(badge_x, 415), (badge_x + 190, 455)], radius=8, fill=(30, 41, 59, 255), outline=(59, 130, 246, 255), width=1)
    draw.text((badge_x + 16, 426), "LOCAL MARKDOWN", fill=(147, 197, 253, 255), font=f_badge)

    badge_x += 205
    draw_rounded_rect(draw, [(badge_x, 415), (badge_x + 215, 455)], radius=8, fill=(30, 41, 59, 255), outline=(16, 185, 129, 255), width=1)
    draw.text((badge_x + 16, 426), "ZERO DATA SILOS", fill=(110, 231, 183, 255), font=f_badge)

    badge_x += 230
    draw_rounded_rect(draw, [(badge_x, 415), (badge_x + 160, 455)], radius=8, fill=(30, 41, 59, 255), outline=(245, 158, 11, 255), width=1)
    draw.text((badge_x + 16, 426), "BYO OLLAMA", fill=(252, 211, 77, 255), font=f_badge)

    # Device Mockup on Right Side (x=680 to 970, y=30 to 480)
    phone_box = [(690, 35), (965, 475)]
    draw_rounded_rect(draw, phone_box, radius=32, fill=(15, 23, 42, 255), outline=(51, 65, 85, 255), width=4)
    # Phone notch / pill
    draw_rounded_rect(draw, [(790, 48), (865, 58)], radius=5, fill=(30, 41, 59, 255))

    # Mock screen content
    # Chat Bubble 1 (User)
    draw_rounded_rect(draw, [(715, 80), (940, 135)], radius=12, fill=(37, 99, 235, 255))
    draw.text((725, 90), "What are my next tasks\nfrom [[Project Nexus]]?", fill=(255, 255, 255, 255), font=ImageFont.truetype(FONT_BOLD, 13))

    # Action badge
    draw_rounded_rect(draw, [(715, 145), (885, 172)], radius=6, fill=(30, 58, 138, 200), outline=(96, 165, 250, 180), width=1)
    draw.text((725, 151), "📁 Reading /Notes/Project Nexus.md", fill=(191, 219, 254, 255), font=ImageFont.truetype(FONT_REG, 11))

    # Chat Bubble 2 (Agent)
    draw_rounded_rect(draw, [(715, 182), (940, 360)], radius=12, fill=(30, 41, 59, 255), outline=(51, 65, 85, 255), width=1)
    response_text = (
        "Found 2 open items in your note:\n\n"
        "• Complete client contract (#todo)\n"
        "• Review [[Architecture Deck]]\n\n"
        "I've updated the status in your\n"
        "vault and linked the meeting notes."
    )
    draw.text((725, 195), response_text, fill=(241, 245, 249, 255), font=ImageFont.truetype(FONT_REG, 12), spacing=4)

    # Input bar at bottom of phone
    draw_rounded_rect(draw, [(710, 395), (945, 440)], radius=14, fill=(15, 23, 42, 255), outline=(71, 85, 105, 255), width=1)
    draw.text((725, 410), "Ask Robin or search vault...", fill=(100, 116, 139, 255), font=ImageFont.truetype(FONT_REG, 12))

    # Save
    out_path = os.path.join(STORE_DIR, "feature-graphic.png")
    img.convert("RGB").save(out_path, quality=95)
    print("Saved feature graphic to", out_path)

def generate_screenshots():
    width, height = 1080, 1920
    screens = [
        {
            "id": "1",
            "filename": "screenshot-1-web-research.png",
            "banner_tag": "LIVE WEB SYNTHESIS",
            "headline": "Autonomous Web Research With Sources",
            "subhead": "Deep live searches that crawl pages and synthesize cited facts",
            "user_prompt": "What are the latest camera specs of the S24 Ultra vs Pixel 9 Pro?",
            "action_badges": [
                ("🔎 Searching DuckDuckGo: 'S24 Ultra vs Pixel 9 Pro camera specs'", (30, 58, 138)),
                ("📄 Reading 2 authoritative source pages", (19, 78, 74))
            ],
            "agent_response": (
                "Here is the verified hardware comparison:\n\n"
                "• **Samsung Galaxy S24 Ultra**:\n"
                "  - Main: 200 MP, f/1.7, 24mm, multi-directional PDAF\n"
                "  - Periscope Telephoto: 50 MP, 5x optical zoom (f/3.4)\n"
                "  - Telephoto: 10 MP, 3x optical zoom\n"
                "  - Ultrawide: 12 MP (120° FOV)\n\n"
                "• **Google Pixel 9 Pro**:\n"
                "  - Main: 50 MP, f/1.68, 25mm, dual-pixel PDAF\n"
                "  - Periscope Telephoto: 48 MP, 5x optical zoom (f/2.8)\n"
                "  - Ultrawide: 48 MP with Macro Focus\n\n"
                "**Key Verdict**: Pixel 9 Pro offers a faster telephoto aperture (f/2.8 vs f/3.4) for low light, while S24 Ultra leads in raw resolution and dual-tele versatility.\n\n"
                "*Sources: GSMArena, TheVerge*"
            )
        },
        {
            "id": "2",
            "filename": "screenshot-2-obsidian-vault.png",
            "banner_tag": "LOCAL OBSIDIAN VAULT",
            "headline": "Reads & Writes Your Obsidian Vault",
            "subhead": "Point Robin at your Markdown folder: answers from your notes with [[wikilinks]]",
            "user_prompt": "What did I decide about database indexing in [[Project Titan]]?",
            "action_badges": [
                ("📁 Searching Vault: 'Project Titan' in /Documents/Vault", (67, 56, 202)),
                ("📄 Opened [[Project Titan - Tech Spec.md]]", (4, 120, 87))
            ],
            "agent_response": (
                "From your note **[[Project Titan - Tech Spec]]** (updated 3 days ago):\n\n"
                "• Decided on **PostgreSQL with pgvector** for vector embeddings.\n"
                "• Primary keys use UUIDv7 for time-ordered locality.\n"
                "• Composite index on `(workspace_id, created_at DESC)` for message board polling.\n\n"
                "Action Taken:\n"
                "I have added an action item to **[[Sprint Checklist]]** under `#backend` to verify index migration scripts."
            )
        },
        {
            "id": "3",
            "filename": "screenshot-3-photo-vision.png",
            "banner_tag": "VISION & ATTACHMENTS",
            "headline": "Photo Vision & Document Intelligence",
            "subhead": "Attach whiteboard sketches, diagrams, or receipts for instant breakdown",
            "user_prompt": "[Photo Attached: System Architecture Whiteboard]\nCan you turn this diagram into a structured architectural spec?",
            "action_badges": [
                ("🖼️ Analyzing whiteboard diagram (1920x1080)", (124, 45, 18)),
                ("🧠 Synthesizing system components", (88, 28, 135))
            ],
            "agent_response": (
                "Here is the structured breakdown of your diagram:\n\n"
                "1. **Client Tier**:\n"
                "   - Native Android Agent (Storage Access Framework)\n"
                "   - Local SQLite Vector Cache\n\n"
                "2. **Gateway Tier**:\n"
                "   - Cloudflare Worker (HMAC signing + SSRF protection)\n"
                "   - Rate-limited DuckDuckGo & Brave web crawlers\n\n"
                "3. **Inference Tier**:\n"
                "   - Cascading endpoints: GPT-OSS 120B → Qwen → Ollama (LAN)\n\n"
                "I have drafted this into a ready-to-save note for your vault."
            )
        },
        {
            "id": "4",
            "filename": "screenshot-4-sovereignty-engines.png",
            "banner_tag": "KEYLESS SOVEREIGNTY",
            "headline": "Zero Signups • BYO Home Ollama",
            "subhead": "Cascade through top open models or route through your own local server",
            "user_prompt": "Set active inference provider to Home Ollama server.",
            "action_badges": [
                ("⚙️ Engine Switched: Ollama LAN (http://192.168.1.100:11434)", (3, 105, 161)),
                ("🔒 Air-Gapped Mode: Prompts stay on private network", (5, 150, 105))
            ],
            "agent_response": (
                "Connected to local Ollama instance:\n\n"
                "• **Active Model**: `llama3.3:70b-instruct-q4_K_M`\n"
                "• **Latency**: 14ms (Local Wi-Fi)\n"
                "• **Privacy Status**: 100% On-Device / Local LAN\n\n"
                "Robin is ready. All vault queries, web summaries, and thoughts will execute entirely through your home server without touching cloud AI providers."
            )
        }
    ]

    f_tag = ImageFont.truetype(FONT_BOLD, 28)
    f_title = ImageFont.truetype(FONT_BOLD, 52)
    f_sub = ImageFont.truetype(FONT_REG, 30)

    f_chat_user = ImageFont.truetype(FONT_BOLD, 30)
    f_badge = ImageFont.truetype(FONT_BOLD, 22)
    f_chat_agent = ImageFont.truetype(FONT_REG, 27)
    f_input = ImageFont.truetype(FONT_REG, 26)

    for sc in screens:
        img = Image.new("RGBA", (width, height), (11, 15, 25, 255))
        draw = ImageDraw.Draw(img)

        # Gradient background
        for y in range(height):
            ratio = y / height
            r = int(11 * (1 - ratio) + 20 * ratio)
            g = int(15 * (1 - ratio) + 25 * ratio)
            b = int(25 * (1 - ratio) + 45 * ratio)
            draw.line([(0, y), (width, y)], fill=(r, g, b, 255))

        # Top Marketing Header
        # Category Tag Badge
        draw_rounded_rect(draw, [(60, 70), (450, 125)], radius=12, fill=(30, 41, 59, 255), outline=(59, 130, 246, 255), width=2)
        draw.text((85, 82), sc["banner_tag"], fill=(96, 165, 250, 255), font=f_tag)

        # Large Headline
        draw.text((60, 150), sc["headline"], fill=(255, 255, 255, 255), font=f_title)
        draw.text((60, 225), sc["subhead"], fill=(148, 163, 184, 255), font=f_sub)

        # Phone Device Shell (x=60 to 1020, y=310 to 1840)
        phone_box = [(60, 310), (1020, 1850)]
        draw_rounded_rect(draw, phone_box, radius=48, fill=(15, 23, 42, 255), outline=(51, 65, 85, 255), width=6)

        # Top status bar & notch
        draw_rounded_rect(draw, [(440, 335), (640, 355)], radius=10, fill=(30, 41, 59, 255))
        # App top bar inside phone
        draw.line([(60, 410), (1020, 410)], fill=(30, 41, 59, 255), width=2)
        draw.text((100, 365), "RobinTHood", fill=(255, 255, 255, 255), font=ImageFont.truetype(FONT_BOLD, 30))
        draw_rounded_rect(draw, [(790, 355), (980, 395)], radius=10, fill=(30, 58, 138, 255))
        draw.text((810, 363), "Local Vault: Active", fill=(191, 219, 254, 255), font=ImageFont.truetype(FONT_BOLD, 18))

        # User Prompt Bubble
        draw_rounded_rect(draw, [(110, 450), (970, 570)], radius=24, fill=(37, 99, 235, 255))
        draw.text((140, 475), sc["user_prompt"], fill=(255, 255, 255, 255), font=f_chat_user, spacing=6)

        # Action Badges
        cur_y = 600
        for badge_text, badge_bg in sc["action_badges"]:
            draw_rounded_rect(draw, [(110, cur_y), (970, cur_y + 55)], radius=12, fill=badge_bg, outline=(255, 255, 255, 50), width=1)
            draw.text((135, cur_y + 14), badge_text, fill=(241, 245, 249, 255), font=f_badge)
            cur_y += 70

        # Agent Response Card
        card_h = 880
        draw_rounded_rect(draw, [(110, cur_y), (970, cur_y + card_h)], radius=24, fill=(30, 41, 59, 255), outline=(71, 85, 105, 255), width=2)
        draw.text((140, cur_y + 35), sc["agent_response"], fill=(241, 245, 249, 255), font=f_chat_agent, spacing=10)

        # Bottom Input Bar
        draw_rounded_rect(draw, [(110, 1720), (970, 1800)], radius=20, fill=(15, 23, 42, 255), outline=(71, 85, 105, 255), width=2)
        draw.text((145, 1745), "Ask Robin or search [[notes]]...", fill=(100, 116, 139, 255), font=f_input)

        out_path = os.path.join(STORE_DIR, sc["filename"])
        img.convert("RGB").save(out_path, quality=95)
        print("Saved screenshot to", out_path)

if __name__ == "__main__":
    generate_feature_graphic()
    generate_screenshots()
