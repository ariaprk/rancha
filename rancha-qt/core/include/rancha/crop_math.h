#pragma once
// The arithmetic behind the cover cropper. A fixed "frame" (the cover shape) sits over a picture that can be dragged
// and zoomed. scale = frame pixels per picture pixel; offsetX / offsetY = where the picture's left / top edge is,
// measured from the frame's left / top edge. Port of the Electron app's src/renderer/src/lib/cropMath.ts.
#include <algorithm>
#include <cmath>

namespace rancha::crop {

struct Size {
  double width = 0;
  double height = 0;
};

struct View {
  double scale = 1;
  double offsetX = 0;
  double offsetY = 0;
};

struct Rect {
  double x = 0, y = 0, width = 0, height = 0;
  int canvasWidth = 0, canvasHeight = 0;
};

inline constexpr double kMaxZoom = 4;  // up to 4x closer than "fill the frame"

/// Cover: a 2:3 frame, saved as 600 x 900. Wallpaper: 16:9, saved up to 1920 x 1080.
inline constexpr Size kCoverFrame{240, 360};
inline constexpr double kCoverOutputWidth = 600;
inline constexpr Size kWallpaperFrame{448, 252};
inline constexpr double kWallpaperOutputWidth = 1920;

/// The picture just FILLS the frame (the edges get cropped).
inline double fillScale(Size image, Size frame) { return std::max(frame.width / image.width, frame.height / image.height); }
/// The WHOLE picture fits inside the frame (bars may show).
inline double fitScale(Size image, Size frame) { return std::min(frame.width / image.width, frame.height / image.height); }

/// Keeps the view legal: the zoom stays in range, a picture bigger than the frame never shows empty space,
/// and a picture smaller than the frame stays centered.
inline View clampView(View view, Size image, Size frame) {
  const double scale = std::min(fillScale(image, frame) * kMaxZoom, std::max(fitScale(image, frame), view.scale));
  const auto axis = [](double offset, double shown, double frameSize) {
    return shown >= frameSize ? std::min(0.0, std::max(frameSize - shown, offset)) : (frameSize - shown) / 2;
  };
  return {scale, axis(view.offsetX, image.width * scale, frame.width), axis(view.offsetY, image.height * scale, frame.height)};
}

/// The starting view: the picture fills the frame, centered.
inline View fillView(Size image, Size frame) {
  const double scale = fillScale(image, frame);
  return clampView({scale, (frame.width - image.width * scale) / 2, (frame.height - image.height * scale) / 2}, image, frame);
}

/// The whole picture visible inside the frame, centered.
inline View fitView(Size image, Size frame) { return clampView({fitScale(image, frame), 0, 0}, image, frame); }

/// Changes the zoom while keeping whatever is at the frame's center in place.
inline View zoomTo(View view, double newScale, Size image, Size frame) {
  const double centerX = (frame.width / 2 - view.offsetX) / view.scale;
  const double centerY = (frame.height / 2 - view.offsetY) / view.scale;
  return clampView({newScale, frame.width / 2 - centerX * newScale, frame.height / 2 - centerY * newScale}, image, frame);
}

/// Moves the picture by a drag of (dx, dy) frame pixels.
inline View panBy(View view, double dx, double dy, Size image, Size frame) {
  return clampView({view.scale, view.offsetX + dx, view.offsetY + dy}, image, frame);
}

/// Where to draw the picture on an output canvas with the frame's shape and `outputWidth` pixels across.
inline Rect outputRect(View view, Size image, Size frame, double outputWidth) {
  const double k = outputWidth / frame.width;
  return {view.offsetX * k,
          view.offsetY * k,
          image.width * view.scale * k,
          image.height * view.scale * k,
          static_cast<int>(std::lround(outputWidth)),
          static_cast<int>(std::lround(frame.height * k))};
}

/// Zoom as a friendly number: 1 = fills the frame, 4 = four times closer.
inline double zoomFactor(View view, Size image, Size frame) { return view.scale / fillScale(image, frame); }

/// The size a saved cover is shrunk to (at most 600 x 900; wide pictures may be 960 wide). Never enlarged.
inline Size coverStoreSize(Size image) {
  const double scale = std::min({1.0, (image.width > image.height ? 960.0 : 600.0) / image.width, 900.0 / image.height});
  return {std::max(1.0, std::round(image.width * scale)), std::max(1.0, std::round(image.height * scale))};
}
/// The same for a wallpaper: at most 1920 x 1080.
inline Size wallpaperStoreSize(Size image) {
  const double scale = std::min({1.0, 1920.0 / image.width, 1080.0 / image.height});
  return {std::max(1.0, std::round(image.width * scale)), std::max(1.0, std::round(image.height * scale))};
}

}  // namespace rancha::crop
