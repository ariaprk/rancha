#include <string>

#include "check.h"
#include "rancha/color.h"
#include "rancha/cover.h"
#include "rancha/theme.h"

using namespace rancha;

namespace {
bool same(const Rgba& c, int r, int g, int b) { return c.r == r && c.g == g && c.b == b; }
}  // namespace

void testColorTheme() {
  // hex
  CHECK(parseHex("#6c8cff").has_value());
  CHECK(same(*parseHex("#6C8CFF"), 0x6c, 0x8c, 0xff));
  CHECK(!parseHex("6c8cff").has_value());
  CHECK(!parseHex("#6c8cf").has_value());
  CHECK(!parseHex("#6c8cfg").has_value());
  CHECK(!parseHex("").has_value());
  CHECK(toHex(*parseHex("#ABCDEF")) == "#abcdef");

  // HSL (reference values from Python's colorsys)
  CHECK(same(fromHsl(0, 1, 0.5), 255, 0, 0));
  CHECK(same(fromHsl(120, 1, 0.5), 0, 255, 0));
  CHECK(same(fromHsl(240, 1, 0.5), 0, 0, 255));
  CHECK(same(fromHsl(265, 0.62, 0.42), 96, 41, 174));
  CHECK(same(fromHsl(303, 0.60, 0.20), 82, 20, 79));
  CHECK(same(fromHsl(20, 0.8, 0.62), 236, 132, 81));
  CHECK(same(fromHsl(-60, 0.5, 0.5), 191, 64, 191));  // negative hue wraps
  CHECK(same(fromHsl(400, 0.3, 0.7), 201, 186, 156));  // above 360 wraps
  CHECK(fromHsl(10, 0.5, 0.5, 0.25).a == 0.25);

  // mixing
  CHECK(same(mixColors(*parseHex("#000000"), *parseHex("#ffffff"), 0.5), 128, 128, 128));
  CHECK(same(mixColors(*parseHex("#102030"), *parseHex("#ffffff"), 0.0), 0x10, 0x20, 0x30));

  // accent gradients: presets keep their own, other colors are computed as in the Electron app (30% white / 18% black)
  const AccentGradient blue = accentGradient("#6c8cff");
  CHECK(toHex(blue.from) == "#8fb0ff" && toHex(blue.to) == "#5a63ff");
  const AccentGradient custom = accentGradient("#808080");
  CHECK(same(custom.from, 166, 166, 166));  // 128 + (255-128)*0.3 = 166.1
  CHECK(same(custom.to, 105, 105, 105));    // 128 - 128*0.18 = 104.96
  CHECK(sanitizeAccent("#ABCDEF") == "#abcdef");
  CHECK(sanitizeAccent("blue") == "#6c8cff");
  CHECK(accentPresets().size() == 7);

  // palettes: values from the stylesheet
  ThemeSettings dark;
  Palette d = makePalette(dark);
  CHECK(d.isDark && toHex(d.bg) == "#1b1e25" && toHex(d.surface2) == "#232733" && toHex(d.text) == "#e9ebf2");
  CHECK(d.glass.a == 0.62 && d.radius == 12 && d.radiusSmall == 8 && d.blurK == 1.0 && d.fastMs == 140 && d.medMs == 240);
  CHECK(toHex(d.accent) == "#6c8cff" && d.ambientStrength == 0.22);

  ThemeSettings light;
  light.mode = ThemeMode::Light;
  CHECK(!makePalette(light).isDark && toHex(makePalette(light).bg) == "#e4e7ee" && makePalette(light).glass.a == 0.70);

  ThemeSettings airy;
  airy.mode = ThemeMode::Airy;
  airy.corners = CornerStyle::Round;
  airy.glass = GlassLevel::Strong;
  airy.motion = MotionLevel::Subtle;
  airy.ambientGlow = false;
  Palette a = makePalette(airy);
  CHECK(toHex(a.bg) == "#dde5f4" && a.radius == 22 && a.radiusSmall == 14 && a.blurK == 1.8 && a.fastMs == 100 && a.medMs == 160 && a.hoverScale == 1.015 && a.ambientStrength == 0.0);

  ThemeSettings off;
  off.glass = GlassLevel::Off;
  off.motion = MotionLevel::Off;
  off.corners = CornerStyle::Sharp;
  Palette o = makePalette(off);
  CHECK(o.blurK == 0.0 && o.glass.a == 0.96 && o.fastMs == 0 && o.medMs == 0 && o.hoverScale == 1.0 && o.radius == 4 && o.radiusSmall == 3);
  off.mode = ThemeMode::Airy;
  CHECK(makePalette(off).glass.a == 0.97 && toHex(makePalette(off).glass) == "#fafcff");

  ThemeSettings bad;
  bad.accent = "nonsense";
  CHECK(toHex(makePalette(bad).accent) == "#6c8cff");

  // names saved in settings.json
  CHECK(themeModeFromString("airy") == ThemeMode::Airy && themeModeFromString("???") == ThemeMode::Dark);
  CHECK(std::string(toString(ThemeMode::Light)) == "light");
  CHECK(cornerStyleFromString("round") == CornerStyle::Round && cornerStyleFromString("") == CornerStyle::Soft);
  CHECK(glassLevelFromString("off") == GlassLevel::Off && std::string(toString(GlassLevel::Strong)) == "strong");
  CHECK(motionLevelFromString("subtle") == MotionLevel::Subtle && std::string(toString(MotionLevel::Off)) == "off");

  // covers
  const CoverColors c = coverColors(265);
  CHECK(same(c.bottom, 61, 35, 67) && same(c.glow, 124, 81, 184));
  CHECK(same(c.top, 87, 61, 123) && c.glow.a == 0.50);  // the calmer (desaturated) placeholder of the Electron app
  CHECK(initials("Starfall Chronicles") == "SC");
  CHECK(initials("  moonlit   vale  ") == "MV");
  CHECK(initials("Episode 1 and more") == "E1");
  CHECK(initials("Notes") == "N");
  CHECK(initials("") == "");
  CHECK(initials("\xC3\xBCnal") == "\xC3\x9C");              // ü -> Ü
  CHECK(initials("\xD0\xB0\xD0\xB1\xD0\xB2 \xD0\xB3") == "\xD0\x90\xD0\x93");  // Cyrillic а в -> А Г
  CHECK(initials("\xE6\x97\xA5\xE6\x9C\xAC") == "\xE6\x97\xA5");              // one CJK word: its first character
}
