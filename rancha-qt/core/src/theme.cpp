#include "rancha/theme.h"

#include <algorithm>
#include <cctype>

namespace rancha {
namespace {

Rgba rgb(int r, int g, int b, double a = 1.0) {
  Rgba c;
  c.r = static_cast<std::uint8_t>(r);
  c.g = static_cast<std::uint8_t>(g);
  c.b = static_cast<std::uint8_t>(b);
  c.a = a;
  return c;
}

Rgba hex(std::string_view text) { return parseHex(text).value_or(Rgba{}); }

std::string lower(std::string_view text) {
  std::string out(text);
  std::transform(out.begin(), out.end(), out.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
  return out;
}

}  // namespace

const std::vector<AccentPreset>& accentPresets() {
  static const std::vector<AccentPreset> presets = {
      {"Blue", "#6c8cff", "#8fb0ff", "#5a63ff"},   {"Purple", "#a855f7", "#d946ef", "#6d7ff0"},
      {"Rose", "#f4577a", "#fb9a85", "#ef3f6f"},   {"Orange", "#fb923c", "#fdc15a", "#f4693a"},
      {"Yellow", "#facc15", "#fde68a", "#f2a20a"}, {"Green", "#34d399", "#7be8a8", "#13a86b"},
      {"Cyan", "#22d3ee", "#6ee7f9", "#2b8be0"}};
  return presets;
}

std::string sanitizeAccent(std::string_view accent) {
  if (parseHex(accent)) return lower(accent);
  return "#6c8cff";
}

AccentGradient accentGradient(std::string_view accent) {
  const std::string key = sanitizeAccent(accent);
  for (const AccentPreset& preset : accentPresets()) {
    if (preset.main == key) return {hex(preset.from), hex(preset.to)};
  }
  const Rgba main = hex(key);
  return {mixColors(main, rgb(255, 255, 255), 0.3), mixColors(main, rgb(0, 0, 0), 0.18)};
}

Palette makePalette(const ThemeSettings& s) {
  Palette p;
  switch (s.mode) {
    case ThemeMode::Dark:
      p.isDark = true;
      p.bg = hex("#1b1e25");
      p.surface = hex("#1a1d26");
      p.surface2 = hex("#232733");
      p.text = hex("#e9ebf2");
      p.textDim = hex("#9097a8");
      p.border = rgb(255, 255, 255, 0.08);
      p.glass = rgb(24, 27, 36, s.glass == GlassLevel::Off ? 0.96 : 0.62);
      p.glassBorder = rgb(255, 255, 255, 0.09);
      p.ambientStrength = 0.22;
      p.lightCenter = rgb(130, 142, 178, 0.13);
      p.shadeBottom = rgb(0, 0, 0, 0.26);
      break;
    case ThemeMode::Light:
      p.isDark = false;
      p.bg = hex("#e4e7ee");
      p.surface = hex("#ffffff");
      p.surface2 = hex("#e6e9f0");
      p.text = hex("#1a1d26");
      p.textDim = hex("#5c6375");
      p.border = rgb(20, 24, 40, 0.10);
      p.glass = rgb(255, 255, 255, s.glass == GlassLevel::Off ? 0.97 : 0.70);
      p.glassBorder = rgb(20, 24, 40, 0.08);
      p.ambientStrength = 0.16;
      p.lightCenter = rgb(255, 255, 255, 0.60);
      p.shadeBottom = rgb(60, 72, 110, 0.10);
      break;
    case ThemeMode::Airy:
      p.isDark = false;
      p.bg = hex("#dde5f4");
      p.surface = hex("#fbfcff");
      p.surface2 = hex("#e8eefa");
      p.text = hex("#1c2644");
      p.textDim = hex("#5a6786");
      p.border = rgb(40, 60, 120, 0.12);
      p.glass = s.glass == GlassLevel::Off ? rgb(250, 252, 255, 0.97) : rgb(255, 255, 255, 0.58);
      p.glassBorder = rgb(255, 255, 255, 0.85);
      p.ambientStrength = 0.20;
      p.lightCenter = rgb(255, 255, 255, 0.80);
      p.shadeBottom = rgb(120, 140, 200, 0.14);
      break;
  }
  if (!s.ambientGlow) p.ambientStrength = 0.0;

  const std::string accent = sanitizeAccent(s.accent);
  const AccentGradient gradient = accentGradient(accent);
  p.accent = hex(accent);
  p.accentFrom = gradient.from;
  p.accentTo = gradient.to;

  switch (s.corners) {
    case CornerStyle::Sharp: p.radius = 4; p.radiusSmall = 3; break;
    case CornerStyle::Soft: p.radius = 12; p.radiusSmall = 8; break;
    case CornerStyle::Round: p.radius = 22; p.radiusSmall = 14; break;
  }
  switch (s.glass) {
    case GlassLevel::Off: p.blurK = 0.0; break;
    case GlassLevel::Normal: p.blurK = 1.0; break;
    case GlassLevel::Strong: p.blurK = 1.8; break;
  }
  switch (s.motion) {
    case MotionLevel::Full: p.fastMs = 140; p.medMs = 240; p.hoverScale = 1.03; break;
    case MotionLevel::Subtle: p.fastMs = 100; p.medMs = 160; p.hoverScale = 1.015; break;
    case MotionLevel::Off: p.fastMs = 0; p.medMs = 0; p.hoverScale = 1.0; break;
  }
  return p;
}

ThemeMode themeModeFromString(std::string_view t) {
  if (t == "light") return ThemeMode::Light;
  if (t == "airy") return ThemeMode::Airy;
  return ThemeMode::Dark;
}
const char* toString(ThemeMode m) { return m == ThemeMode::Light ? "light" : m == ThemeMode::Airy ? "airy" : "dark"; }
CornerStyle cornerStyleFromString(std::string_view t) {
  if (t == "sharp") return CornerStyle::Sharp;
  if (t == "round") return CornerStyle::Round;
  return CornerStyle::Soft;
}
const char* toString(CornerStyle c) { return c == CornerStyle::Sharp ? "sharp" : c == CornerStyle::Round ? "round" : "soft"; }
GlassLevel glassLevelFromString(std::string_view t) {
  if (t == "off") return GlassLevel::Off;
  if (t == "strong") return GlassLevel::Strong;
  return GlassLevel::Normal;
}
const char* toString(GlassLevel g) { return g == GlassLevel::Off ? "off" : g == GlassLevel::Strong ? "strong" : "normal"; }
MotionLevel motionLevelFromString(std::string_view t) {
  if (t == "subtle") return MotionLevel::Subtle;
  if (t == "off") return MotionLevel::Off;
  return MotionLevel::Full;
}
const char* toString(MotionLevel m) { return m == MotionLevel::Subtle ? "subtle" : m == MotionLevel::Off ? "off" : "full"; }

}  // namespace rancha
