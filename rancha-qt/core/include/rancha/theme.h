#pragma once
#include <string>
#include <string_view>
#include <vector>

#include "rancha/color.h"

namespace rancha {

// The look of the app, as the Electron app has it (values copied from its stylesheet): three themes, accent color,
// corner roundness, frosted-glass strength and how much things move. The core only computes the numbers and colors;
// the window just shows them.
enum class ThemeMode { Dark, Light, Airy };
enum class CornerStyle { Sharp, Soft, Round };
enum class GlassLevel { Off, Normal, Strong };
enum class MotionLevel { Full, Subtle, Off };

struct ThemeSettings {
  ThemeMode mode = ThemeMode::Dark;
  std::string accent = "#6c8cff";
  CornerStyle corners = CornerStyle::Soft;
  GlassLevel glass = GlassLevel::Normal;
  MotionLevel motion = MotionLevel::Full;
  bool ambientGlow = true;
};

struct Palette {
  bool isDark = true;
  Rgba bg, surface, surface2, text, textDim, border, glass, glassBorder;
  Rgba accent, accentFrom, accentTo;  // the accent and its two-tone gradient
  Rgba lightCenter, shadeBottom;       // the soft light and shade drawn behind everything
  double ambientStrength = 0.0;        // the accent-colored glow in the background (0 = none)
  double radius = 12;                  // cards and panels
  double radiusSmall = 8;              // buttons and small things
  double blurK = 1.0;                  // frosted-glass strength factor (0 = no blur)
  int fastMs = 140;                    // short animations
  int medMs = 240;                     // normal animations
  double hoverScale = 1.03;            // how much a card grows under the pointer
};

Palette makePalette(const ThemeSettings& settings);

struct AccentPreset {
  std::string name;
  std::string main;  // what is saved as the accent
  std::string from;  // light start of the gradient
  std::string to;    // deeper end
};
const std::vector<AccentPreset>& accentPresets();

struct AccentGradient {
  Rgba from;
  Rgba to;
};
// The gradient of an accent: a preset's own, or (any other color) lightened for the start and darkened for the end.
AccentGradient accentGradient(std::string_view accent);
// A valid "#rrggbb" in lower case, or the default blue when the text is not a color.
std::string sanitizeAccent(std::string_view accent);

// Names as saved in settings.json ("dark", "soft", ...). Unknown text gives the default.
ThemeMode themeModeFromString(std::string_view text);
const char* toString(ThemeMode mode);
CornerStyle cornerStyleFromString(std::string_view text);
const char* toString(CornerStyle corners);
GlassLevel glassLevelFromString(std::string_view text);
const char* toString(GlassLevel glass);
MotionLevel motionLevelFromString(std::string_view text);
const char* toString(MotionLevel motion);

}  // namespace rancha
