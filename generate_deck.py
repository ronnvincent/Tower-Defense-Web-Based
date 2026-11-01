import sys
import os

sys.path.append(r'C:\Users\4tvon\AppData\Roaming\Python\Python314\site-packages')

from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_SHAPE

def build_direct_deck(output_path):
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank_layout = prs.slide_layouts[6]

    # Colors: Clean, high contrast, NO card clutter
    C_WHITE = RGBColor(255, 255, 255)
    C_DARK = RGBColor(17, 24, 39)       # Near-black Slate 900
    C_MUTED = RGBColor(75, 85, 99)      # Slate 600
    C_BLUE = RGBColor(37, 99, 235)      # Primary Accent Blue

    FONT_TITLE = 'Arial'
    FONT_BODY = 'Calibri'

    def set_white_bg(slide):
        bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(13.333), Inches(7.5))
        bg.fill.solid()
        bg.fill.fore_color.rgb = C_WHITE
        bg.line.fill.background()
        return bg

    def add_header(slide, title, kicker=None):
        tb = slide.shapes.add_textbox(Inches(1.0), Inches(0.8), Inches(11.3), Inches(1.3))
        tf = tb.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0

        if kicker:
            p_kicker = tf.paragraphs[0]
            p_kicker.text = kicker.upper()
            p_kicker.font.name = FONT_BODY
            p_kicker.font.size = Pt(14)
            p_kicker.font.bold = True
            p_kicker.font.color.rgb = C_BLUE
            p_kicker.space_after = Pt(6)
            p_title = tf.add_paragraph()
        else:
            p_title = tf.paragraphs[0]

        p_title.text = title
        p_title.font.name = FONT_TITLE
        p_title.font.size = Pt(36)
        p_title.font.bold = True
        p_title.font.color.rgb = C_DARK

    def add_section(slide, left, top, width, height, heading, bullets):
        tb = slide.shapes.add_textbox(Inches(left), Inches(top), Inches(width), Inches(height))
        tf = tb.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0

        p_head = tf.paragraphs[0]
        p_head.text = heading
        p_head.font.name = FONT_TITLE
        p_head.font.size = Pt(24)
        p_head.font.bold = True
        p_head.font.color.rgb = C_BLUE
        p_head.space_after = Pt(14)

        for b in bullets:
            p_bullet = tf.add_paragraph()
            p_bullet.text = "• " + b
            p_bullet.font.name = FONT_BODY
            p_bullet.font.size = Pt(19)
            p_bullet.font.color.rgb = C_DARK
            p_bullet.space_after = Pt(10)

    # -------------------------------------------------------------
    # SLIDE 1: TITLE SLIDE
    # -------------------------------------------------------------
    s1 = prs.slides.add_slide(blank_layout)
    set_white_bg(s1)

    tb1 = s1.shapes.add_textbox(Inches(1.0), Inches(2.2), Inches(11.3), Inches(3.8))
    tf1 = tb1.text_frame
    tf1.word_wrap = True

    p0 = tf1.paragraphs[0]
    p0.text = "TOWER DEFENSE: DSALGO BASTION"
    p0.font.name = FONT_TITLE
    p0.font.size = Pt(46)
    p0.font.bold = True
    p0.font.color.rgb = C_DARK
    p0.space_after = Pt(16)

    p1 = tf1.add_paragraph()
    p1.text = "Simple Guide: Mechanics, Strategy, & How the Code Thinks"
    p1.font.name = FONT_BODY
    p1.font.size = Pt(24)
    p1.font.color.rgb = C_BLUE
    p1.space_after = Pt(26)

    p2 = tf1.add_paragraph()
    p2.text = "A direct, no-fluff explanation designed for high school students."
    p2.font.name = FONT_BODY
    p2.font.size = Pt(18)
    p2.font.color.rgb = C_MUTED

    # -------------------------------------------------------------
    # SLIDE 2: HOW THE GAME WORKS (THE BASICS)
    # -------------------------------------------------------------
    s2 = prs.slides.add_slide(blank_layout)
    set_white_bg(s2)
    add_header(s2, "How the Game Works", "The Basics")

    add_section(s2, 1.0, 2.3, 5.4, 4.8, "The Goal", [
        "Your base sits on the right side with 20 HP.",
        "Monsters spawn on the left and march along the road to destroy your base.",
        "If your base HP reaches 0, you lose.",
        "Survive all 6 waves to win the game!"
    ])

    add_section(s2, 6.9, 2.3, 5.4, 4.8, "The Gameplay Loop", [
        "Monsters walk on the road.",
        "Your towers shoot them down.",
        "Defeated monsters drop Gold Coins.",
        "Use your gold to buy new towers, upgrade them, or reinforce your base."
    ])

    # -------------------------------------------------------------
    # SLIDE 3: YOUR DEFENSES & FIGHTING BASE
    # -------------------------------------------------------------
    s3 = prs.slides.add_slide(blank_layout)
    set_white_bg(s3)
    add_header(s3, "Your Arsenal & The Fighting Base", "Defenses")

    add_section(s3, 1.0, 2.3, 5.4, 4.8, "The 4 Main Towers", [
        "Archer Tower: Shoots fast arrows (great against fast runners).",
        "Cannon Battery: Fires bombs that blow up groups of enemies.",
        "Frost Spire: Freezes monsters to slow them down.",
        "Road Barricade: A roadblock that forces monsters to take the long way."
    ])

    add_section(s3, 6.9, 2.3, 5.4, 4.8, "The Bastion (Your Base Attacks Too!)", [
        "Your base isn't helpless—it fights back!",
        "Level 1–2: Fires arrows at ground and flying monsters.",
        "Level 3–5 Choices:",
        "  • Storm Path: Strikes lightning straight from the sky to shock crowds.",
        "  • Fire Path: Rains explosive mortar shells that leave fire on the road."
    ])

    # -------------------------------------------------------------
    # SLIDE 4: THE 3 BEST WINNING TACTICS
    # -------------------------------------------------------------
    s4 = prs.slides.add_slide(blank_layout)
    set_white_bg(s4)
    add_header(s4, "3 Smart Tactics to Win", "Strategy")

    add_section(s4, 1.0, 2.3, 11.3, 4.8, "Simple Tactics that Beat Any Wave", [
        "1. The Detour Trap: Drop a cheap 30-gold barricade on the middle shortcut. Monsters have to walk twice as far, giving your towers double the time to shoot them!",
        "2. Freeze & Bomb Combo: Slow the front runner with a Frost tower so the monsters clump together, then blast the entire crowd with one Cannon bomb.",
        "3. Take Out the Healer: Plague Shamans heal nearby monsters. Switch your towers to target them first before they heal the boss!"
    ])

    # -------------------------------------------------------------
    # SLIDE 5: HOW THE ALGORITHMS WORK
    # -------------------------------------------------------------
    s5 = prs.slides.add_slide(blank_layout)
    set_white_bg(s5)
    add_header(s5, "How the Code Thinks (Algorithms Made Simple)", "Computer Science")

    add_section(s5, 1.0, 2.3, 5.4, 4.8, "Pathfinding & Spawning", [
        "BFS (Monster GPS):",
        "  • Like Google Maps: Finds the fastest road to your base.",
        "  • If you place a barricade, it instantly finds a detour.",
        "  • Anti-Cheat: You cannot block the road completely!",
        "Circular Queue (The Lunch Line):",
        "  • First In, First Out (FIFO): Spawns enemies in order.",
        "  • Loops in a circle so the game never lags."
    ])

    add_section(s5, 6.9, 2.3, 5.4, 4.8, "Map & Leaderboard", [
        "Graph (The Road Network):",
        "  • Connects road tiles like school hallways.",
        "  • Dropping a barricade cuts that hallway off the map.",
        "Merge Sort (The Fair Leaderboard):",
        "  • Ranks high scores like sorting a deck of cards.",
        "  • Fast, 100% fair, and never glitches on ties."
    ])

    # -------------------------------------------------------------
    # SLIDE 6: SUMMARY
    # -------------------------------------------------------------
    s6 = prs.slides.add_slide(blank_layout)
    set_white_bg(s6)
    add_header(s6, "Summary: Why It Works", "Conclusion")

    add_section(s6, 1.0, 2.3, 11.3, 4.8, "The Key Takeaways", [
        "Smart Strategy: Using barricades to make longer paths is the easiest way to win.",
        "Base That Fights: Upgrading your base gives you a powerful safety net.",
        "Smooth & Lag-Free: Custom data structures keep the game running at 60 FPS.",
        "Rock-Solid Code: Built from scratch with over 1,860 passing tests!"
    ])

    try:
        prs.save(output_path)
        print(f"Successfully generated direct 6-slide presentation at: {output_path}")
    except PermissionError:
        fallback_path = os.path.join(os.getcwd(), 'Tower_Defense_Quick_Guide.pptx')
        prs.save(fallback_path)
        print(f"File was locked by PowerPoint. Saved to fallback: {fallback_path}")

if __name__ == '__main__':
    output_file = os.path.join(os.getcwd(), 'Tower_Defense_Presentation.pptx')
    build_direct_deck(output_file)
