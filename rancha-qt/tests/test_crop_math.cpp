#include <cmath>

#include "check.h"
#include "rancha/crop_math.h"

using namespace rancha::crop;

namespace {
bool near(double a, double b) { return std::abs(a - b) < 1e-9; }
bool sameView(View v, double scale, double x, double y) { return near(v.scale, scale) && near(v.offsetX, x) && near(v.offsetY, y); }
}  // namespace

void testCropMath() {
  const Size wide{1000, 500};
  const Size frame = kCoverFrame;  // 240 x 360

  CHECK(near(fillScale(wide, frame), 0.72));
  CHECK(near(fitScale(wide, frame), 0.24));

  // the start: the picture fills the frame, centered (the sides are cut off)
  const View fill = fillView(wide, frame);
  CHECK(sameView(fill, 0.72, -240, 0));
  CHECK(near(zoomFactor(fill, wide, frame), 1));

  // the whole picture, with bars above and below
  CHECK(sameView(fitView(wide, frame), 0.24, 0, 120));

  // the zoom stays between "fit" and 4x "fill"
  CHECK(near(clampView({100, 0, 0}, wide, frame).scale, 0.72 * kMaxZoom));
  CHECK(near(clampView({0.01, 0, 0}, wide, frame).scale, 0.24));

  // dragging never shows empty space next to a picture bigger than the frame
  CHECK(sameView(panBy(fill, 1000, 0, wide, frame), 0.72, 0, 0));
  CHECK(sameView(panBy(fill, -1000, 50, wide, frame), 0.72, -480, 0));
  CHECK(sameView(panBy(fill, 100, 0, wide, frame), 0.72, -140, 0));

  // zooming keeps the center of the frame in place
  const View zoomed = zoomTo(fill, 1.44, wide, frame);
  CHECK(sameView(zoomed, 1.44, -600, -180));
  CHECK(near(zoomFactor(zoomed, wide, frame), 2));

  // drawing on the saved 600 x 900 cover
  const Rect out = outputRect(fill, wide, frame, kCoverOutputWidth);
  CHECK(near(out.x, -600) && near(out.y, 0) && near(out.width, 1800) && near(out.height, 900));
  CHECK(out.canvasWidth == 600 && out.canvasHeight == 900);
  const Rect wall = outputRect(fillView({3840, 2160}, kWallpaperFrame), {3840, 2160}, kWallpaperFrame, kWallpaperOutputWidth);
  CHECK(wall.canvasWidth == 1920 && wall.canvasHeight == 1080 && near(wall.width, 1920) && near(wall.x, 0));

  // stored sizes: shrunk, never enlarged
  const auto sizeIs = [](Size s, double w, double h) { return s.width == w && s.height == h; };
  CHECK(sizeIs(coverStoreSize({1000, 500}), 960, 480));
  CHECK(sizeIs(coverStoreSize({1200, 1800}), 600, 900));
  CHECK(sizeIs(coverStoreSize({600, 900}), 600, 900));
  CHECK(sizeIs(coverStoreSize({100, 100}), 100, 100));
  CHECK(sizeIs(coverStoreSize({5000, 1}), 960, 1));  // never 0 pixels
  CHECK(sizeIs(wallpaperStoreSize({3840, 2160}), 1920, 1080));
  CHECK(sizeIs(wallpaperStoreSize({4000, 1000}), 1920, 480));
  CHECK(sizeIs(wallpaperStoreSize({800, 600}), 800, 600));
}
